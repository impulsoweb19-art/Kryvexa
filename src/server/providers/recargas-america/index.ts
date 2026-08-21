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
  type RawBuyGames,
  type RawBuyPins,
  type RawGameProduct,
  type RawOrder,
  type RawPinProduct,
  type RawValidate,
  type RawWallet,
  mapBuyGames,
  mapBuyPins,
  mapGameProduct,
  mapOrder,
  mapPinProduct,
  priceToUsdCents,
} from "./mapper";
import * as mock from "./mock";
import { logger } from "@/lib/logger";

/**
 * RecargasAmericaService — implementación de `ProviderAdapter`.
 *
 * SOLO usa los endpoints documentados en la colección Postman:
 *   GET  /wallet
 *   GET  /products/games
 *   GET  /products/pins
 *   POST /buy/games
 *   POST /buy/pins
 *   POST /pins/validate
 *   GET  /orders/{reference}
 *
 * Los endpoints de streaming existen pero quedan fuera del alcance v1.
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

  // ── Catálogo: /products/games + /products/pins ────────────────────────────
  async listProducts(): Promise<ProviderProduct[]> {
    const [games, pins] = await Promise.all([this.listGameProducts(), this.listPinProducts()]);
    return [...games, ...pins];
  }

  private async listGameProducts(): Promise<ProviderProduct[]> {
    const raw = isMock()
      ? mock.mockGameProducts
      : await request<RawGameProduct[]>({
          operation: "products.games",
          method: "GET",
          path: "/products/games",
        });
    return toArray(raw).map(mapGameProduct);
  }

  private async listPinProducts(): Promise<ProviderProduct[]> {
    try {
      const raw = isMock()
        ? mock.mockPinProducts
        : await request<RawPinProduct[]>({
            operation: "products.pins",
            method: "GET",
            path: "/products/pins",
          });
      return toArray(raw).map(mapPinProduct);
    } catch (e) {
      // El catálogo de PINs es secundario para Free Fire: si falla, seguimos
      // con los paquetes de juego en lugar de dejar la tienda vacía.
      logger.warn("No se pudo obtener /products/pins", { error: (e as Error).message });
      return [];
    }
  }

  // ── POST /pins/validate — precheck SIN descontar saldo ────────────────────
  async validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult> {
    // La documentación restringe este endpoint a productos type=recharge de
    // /products/pins. Para los paquetes de /products/games NO existe validación
    // documentada: devolvemos supported=false en lugar de inventar una llamada.
    if (input.kind !== "RECHARGE") {
      return { supported: false, valid: false, accountName: null };
    }

    const raw = isMock()
      ? mock.mockValidate(input.accountId)
      : await request<RawValidate>({
          operation: "pins.validate",
          method: "POST",
          path: "/pins/validate",
          body: {
            product_id: numericId(input.externalId),
            service_user_id: input.accountId,
          },
        });

    return {
      supported: true,
      valid: raw.status === true,
      accountName: raw.account_name ?? null,
    };
  }

  // ── Compra ────────────────────────────────────────────────────────────────
  async purchase(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    if (input.kind === "GAME_PACKAGE") return this.buyGame(input, orderId);
    return this.buyPin(input, orderId);
  }

  /** POST /buy/games — package_id + input1..N */
  private async buyGame(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      package_id: numericId(input.externalId),
      client_name: input.clientReference,
    };
    // Solo se envían los input1..N; nada más viaja al proveedor.
    for (const [k, v] of Object.entries(input.inputs)) {
      if (/^input[1-9][0-9]?$/.test(k)) body[k] = v;
    }

    if (isMock()) return mapBuyGames(mock.mockBuyGames(input.externalId, input.inputs) as RawBuyGames);

    const raw = await request<RawBuyGames>({
      operation: "buy.games",
      method: "POST",
      path: "/buy/games",
      body,
      orderId,
    });
    return mapBuyGames(raw);
  }

  /**
   * POST /buy/pins — el body cambia según el tipo:
   *   type=pin      → { product_id, quantity }
   *   type=recharge → { product_id, redemption_id }
   * NUNCA se envían `quantity` y `redemption_id` juntos (lo prohíbe la doc).
   */
  private async buyPin(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      product_id: numericId(input.externalId),
      client_name: input.clientReference,
    };

    if (input.kind === "RECHARGE") {
      const redemptionId = input.inputs.redemption_id ?? input.inputs.input1;
      if (!redemptionId) throw new Error("Falta redemption_id para un producto de tipo recarga");
      body.redemption_id = redemptionId;
    } else {
      const quantity = Number(input.inputs.quantity ?? "1");
      body.quantity = Math.min(Math.max(1, Math.trunc(quantity) || 1), 10); // máx 10 según la doc
    }

    if (isMock()) return mapBuyPins(mock.mockBuyPins(input.externalId) as RawBuyPins);

    const raw = await request<RawBuyPins>({
      operation: "buy.pins",
      method: "POST",
      path: "/buy/pins",
      body,
      orderId,
    });
    return mapBuyPins(raw);
  }

  // ── GET /orders/{reference} — conciliación de órdenes PENDING ─────────────
  async getOrderStatus(reference: string, orderId?: string): Promise<OrderStatusResult> {
    if (isMock()) return mapOrder(mock.mockOrderStatus(reference));

    const raw = await request<RawOrder>({
      operation: "orders.get",
      method: "GET",
      path: `/orders/${encodeURIComponent(reference)}`,
      orderId,
      timeoutMs: 15_000,
    });
    return mapOrder(raw);
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
