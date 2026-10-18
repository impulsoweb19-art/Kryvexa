import "server-only";

import type {
  OrderStatusResult,
  ProviderAdapter,
  ProviderHealth,
  ProviderProduct,
  ProviderWallet,
  PurchaseInput,
  PurchaseResult,
  ValidateAccountInput,
  ValidateAccountResult,
} from "../types";
import {
  PROVIDER_CODE,
  ProviderRequestError,
  baseUrl,
  isConfigured,
  isMock,
  request,
} from "./client";
import {
  type RawBuyCatalog,
  type RawCatalogProduct,
  type RawCatalogValidate,
  type RawOrder,
  type RawWallet,
  mapBuyCatalog,
  mapCatalogProduct,
  mapOrder,
  priceToUsdCents,
} from "./mapper";
import * as mock from "./mock";
import { logger } from "@/lib/logger";

/**
 * RecargasAmericaService — implementación de `ProviderAdapter`.
 *
 * SOLO usa los endpoints documentados en la colección Postman:
 *   GET  /wallet
 *   GET  /products/catalog
 *   POST /buy/catalog
 *   POST /catalog/validate
 *   GET  /orders/{referencia}
 *
 * CATÁLOGO UNIFICADO (migración del 2026-09-20)
 * ─────────────────────────────────────────────
 * El proveedor apagó /products/games, /products/pins, /buy/games, /buy/pins y
 * /pins/validate, y los reemplazó por un catálogo único cuyo `id`/`sku` no
 * cambia aunque cambie el proveedor que termina cumpliendo la compra.
 *
 * El punto flojo de la migración es la conciliación: su documentación dice que
 * para el catálogo «todavía no hay endpoint de consulta por referencia». Su
 * soporte respondió que sí existe y que lo van a documentar, así que
 * `getOrderStatus` intenta la consulta igual contra /orders/{id}: si todavía no
 * está habilitada, responde 404 y lo tratamos como UNKNOWN (la orden sigue
 * pendiente y la revisa una persona) en vez de dar por fallida una compra que
 * quizá sí se entregó. El día que la habiliten, empieza a funcionar sin tocar
 * el código.
 *
 * Los endpoints de streaming existen pero quedan fuera del alcance.
 */
class RecargasAmericaService implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  readonly name = "RecargasAmérica";

  get baseUrl(): string {
    return baseUrl();
  }

  isConfigured(): boolean {
    return isConfigured();
  }

  // ── GET /wallet — saldo del REVENDEDOR (nuestro), nunca el del usuario ────
  async getWallet(): Promise<ProviderWallet> {
    const raw = isMock()
      ? mock.mockWallet
      : await request<RawWallet>({ operation: "wallet", method: "GET", path: "/wallet" });

    return { balanceCents: priceToUsdCents(raw.balance), currency: raw.currency ?? "USD" };
  }

  // ── GET /products/catalog — catálogo unificado ────────────────────────────
  async listProducts(): Promise<ProviderProduct[]> {
    const raw = isMock()
      ? mock.mockCatalogProducts
      : await request<RawCatalogProduct[]>({
          operation: "products.catalog",
          method: "GET",
          path: "/products/catalog",
        });
    return toArray(raw).map(mapCatalogProduct);
  }

  // ── POST /catalog/validate — precheck SIN descontar saldo ─────────────────
  async validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult> {
    if (input.kind !== "RECHARGE") {
      return { supported: false, valid: false, accountName: null };
    }

    const raw = isMock()
      ? mock.mockValidate(input.accountId)
      : await request<RawCatalogValidate>({
          operation: "catalog.validate",
          method: "POST",
          path: "/catalog/validate",
          body: {
            product_id: numericId(input.externalId),
            service_user_id: input.accountId,
          },
        });

    // `supported:false` significa que el proveedor que hoy cumple esta compra
    // no sabe hacer precheck. Es "sin dato", NO "ID inválido": bloquear la
    // compra por eso sería rechazar jugadores que sí existen.
    if (raw.supported === false) {
      return { supported: false, valid: false, accountName: null };
    }

    return {
      supported: true,
      valid: raw.status === true,
      accountName: raw.account_name ?? null,
    };
  }

  /**
   * POST /buy/catalog
   *
   * El body lleva `product_id`, la cantidad, y los campos canónicos que el
   * producto haya declarado en `required_fields` (player_id, zone_id, …). Esos
   * nombres se guardaron tal cual al sincronizar el catálogo, así que lo que
   * escribió el comprador se reenvía sin traducir.
   *
   * Va con `Idempotency-Key` = el código de nuestra orden: si por un timeout
   * reintentáramos la misma compra, el proveedor responde 409 en vez de cobrar
   * y entregar dos veces.
   */
  async purchase(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      product_id: numericId(input.externalId),
      client_name: input.clientReference,
    };

    const quantity = Number(input.inputs.quantity ?? "1");
    body.quantity = Math.min(Math.max(1, Math.trunc(quantity) || 1), 10); // máx 10 según la doc

    for (const [key, value] of Object.entries(input.inputs)) {
      if (key === "quantity") continue;
      if (CANONICAL_FIELDS.has(key)) body[key] = value;
    }

    if (isMock()) {
      return mapBuyCatalog(mock.mockBuyCatalog(input.externalId, input.inputs) as RawBuyCatalog);
    }

    const raw = await request<RawBuyCatalog>({
      operation: "buy.catalog",
      method: "POST",
      path: "/buy/catalog",
      body,
      orderId,
      idempotencyKey: input.clientReference,
    });
    return mapBuyCatalog(raw);
  }

  // ── GET /orders/{id} — conciliación de órdenes PENDING ───────────────────
  //
  // El proveedor devuelve DOS identificadores de la misma compra:
  //
  //   order_id:       "RAAPI-MP-1006915-1QRB"
  //   transaction_id: 1006915
  //
  // y el número va embebido en la cadena. Preguntábamos con la cadena
  // completa y respondía 404 "Orden no encontrada" — el motivo por el que los
  // pedidos diferidos llevaban meses atascados en "En proceso" y el dueño los
  // marcaba a mano uno por uno.
  //
  // Se prueban los dos: primero el número, que es lo que suele esperar un
  // endpoint así, y si no, la cadena. No se adivina cuál es el bueno: el que
  // funcione queda en la bitácora y entonces se simplifica.

  /** "RAAPI-MP-1006915-1QRB" → "1006915". Null si no tiene esa forma. */
  private numeroDeReferencia(reference: string): string | null {
    return /^RAAPI-[A-Z]+-(\d+)-/i.exec(reference)?.[1] ?? null;
  }

  private async pedirEstado(id: string, orderId?: string): Promise<OrderStatusResult | "no-existe"> {
    try {
      return mapOrder(
        await request<RawOrder>({
          operation: "orders.get",
          method: "GET",
          path: `/orders/${encodeURIComponent(id)}`,
          orderId,
          timeoutMs: 15_000,
        }),
      );
    } catch (e) {
      if (e instanceof ProviderRequestError && e.httpStatus === 404) return "no-existe";
      throw e;
    }
  }

  async getOrderStatus(reference: string, orderId?: string): Promise<OrderStatusResult> {
    if (isMock()) return mapOrder(mock.mockOrderStatus(reference));

    const numero = this.numeroDeReferencia(reference);
    const candidatos = numero ? [numero, reference] : [reference];

    for (const id of candidatos) {
      const r = await this.pedirEstado(id, orderId);
      if (r !== "no-existe") return r;
    }

    // Ninguno de los dos existe para ellos. "No puedo preguntar" NO es "la
    // compra falló": se devuelve UNKNOWN para que la orden siga pendiente y
    // acabe en revisión manual, nunca reembolsada a ciegas.
    logger.warn("El proveedor no reconoce ninguno de los dos identificadores", {
      reference,
      numero,
    });
    return { status: "UNKNOWN", reference, transactionId: null, item: null, pins: [], raw: null };
  }

  // ── Diagnóstico para el panel admin ───────────────────────────────────────
  async health(): Promise<ProviderHealth> {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        ok: false,
        configured: false,
        mock: isMock(),
        latencyMs: null,
        balanceCents: null,
        currency: null,
        message: "Falta RECARGAS_AMERICA_API_KEY en el entorno del servidor.",
      };
    }

    const startedAt = Date.now();
    try {
      const wallet = await this.getWallet();
      return {
        ok: true,
        configured: true,
        mock: isMock(),
        latencyMs: Date.now() - startedAt,
        balanceCents: wallet.balanceCents,
        currency: wallet.currency,
        message: isMock() ? "Modo simulado activo (PROVIDER_MOCK=true)." : null,
      };
    } catch (e) {
      const err = e as ProviderRequestError;
      return {
        ok: false,
        configured: true,
        mock: isMock(),
        latencyMs: Date.now() - startedAt,
        balanceCents: null,
        currency: null,
        message: err.kind ? `Fallo de conexión (${err.kind}).` : "Fallo de conexión.",
      };
    }
  }
}

/**
 * Los únicos nombres de campo que /buy/catalog entiende. Se filtra contra esta
 * lista para que nunca viaje al proveedor nada que el comprador haya podido
 * inyectar en el formulario.
 */
const CANONICAL_FIELDS = new Set(["player_id", "zone_id", "server_id", "manual_id", "username"]);

function toArray<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

/** Los IDs del proveedor son numéricos; si no lo fueran, se envían tal cual. */
function numericId(externalId: string): number | string {
  const n = Number(externalId);
  return Number.isInteger(n) ? n : externalId;
}

export const recargasAmerica = new RecargasAmericaService();
export { PROVIDER_CODE };
