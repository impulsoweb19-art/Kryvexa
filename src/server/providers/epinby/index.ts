import "server-only";

import { baseUrlString } from "@/lib/base-url";
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
import { PROVIDER_CODE, baseUrl, isConfigured, isMock, request } from "./client";
import {
  type RawGame,
  type RawOrder,
  type RawProduct,
  type RawValidatePlayer,
  mapOrder,
  mapProduct,
  mapValidatePlayer,
  priceToUsdCents,
} from "./mapper";
import * as mock from "./mock";
import { logger } from "@/lib/logger";

/**
 * Solo Mobile Legends en esta versión — mismo criterio que Free Fire en
 * RecargasAmérica. El catálogo real de EpinBy nombra el juego "Mobil
 * Legends" (sin la segunda "e" de "Mobile"), así que esa "e" es opcional.
 */
const GAME_FILTER = /mobile?\s*legends/i;

interface RawGetMe {
  user_id: number;
  username: string;
  balance: string;
  webhook_secret: string;
  currency: string;
}

interface RawProductsPage {
  data: RawProduct[];
  meta: { total: number; per_page: number; current_page: number; last_page: number };
}

/**
 * EpinbyService — implementación de `ProviderAdapter` para epinby.com.
 *
 * SOLO usa los endpoints documentados en https://epinby.com/docs:
 *   GET  /getMe
 *   GET  /games       (referencia; el filtro real es por el campo `game` de /products)
 *   GET  /products
 *   POST /validate-player
 *   POST /order
 *   GET  /order/{id}
 *
 * Redeem Data API y Telegram Stars API existen pero quedan fuera del alcance
 * (son otros productos del mismo panel, no recargas de juego).
 */
class EpinbyService implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  readonly name = "EpinBy";

  get baseUrl(): string {
    return baseUrl();
  }

  isConfigured(): boolean {
    return isConfigured();
  }

  // ── GET /getMe — saldo del REVENDEDOR (nuestro) ───────────────────────────
  async getWallet(): Promise<ProviderWallet> {
    const raw = isMock()
      ? mock.mockWallet
      : await request<RawGetMe>({ operation: "getMe", method: "GET", path: "/getMe" });

    return { balanceCents: priceToUsdCents(raw.balance), currency: raw.currency ?? "USD" };
  }

  // ── Catálogo: /products, filtrado a Mobile Legends ────────────────────────
  async listProducts(): Promise<ProviderProduct[]> {
    if (isMock()) return mock.mockProducts.filter(matchesGame).map(mapProduct);

    // El catálogo completo de EpinBy tiene ~2500 productos en ~25 páginas de
    // 100 (todos los juegos que vende, no solo Mobile Legends). Pedirlas una
    // por una agotaba el tiempo máximo de la función antes de terminar — se
    // piden en paralelo, por tandas, para que la sincronización termine a
    // tiempo sin lanzar 25 peticiones simultáneas de golpe.
    const fetchPage = (page: number) =>
      request<RawProductsPage>({
        operation: "products.list",
        method: "GET",
        path: `/products?per_page=100&page=${page}`,
      });

    const first = await fetchPage(1);
    const all: RawProduct[] = [...(first.data ?? [])];
    const lastPage = first.meta?.last_page ?? 1;

    const CONCURRENCY = 8;
    for (let start = 2; start <= lastPage; start += CONCURRENCY) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, lastPage - start + 1) }, (_, i) => fetchPage(start + i)),
      );
      for (const page of batch) all.push(...(page.data ?? []));
    }

    return all.filter(matchesGame).map(mapProduct);
  }

  // ── POST /validate-player — precheck SIN descontar saldo ──────────────────
  async validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult> {
    // Documentado solo para productos type=TOPUP (nuestro kind "RECHARGE").
    // server_id es opcional según la doc, así que no hace falta aquí: solo se
    // usa al comprar (ver `purchase`).
    if (input.kind !== "RECHARGE") {
      return { supported: false, valid: false, accountName: null };
    }

    const raw = isMock()
      ? mock.mockValidatePlayer(input.accountId)
      : await request<RawValidatePlayer>({
          operation: "validate-player",
          method: "POST",
          path: "/validate-player",
          body: { product_id: numericId(input.externalId), player_id: input.accountId },
        });

    const mapped = mapValidatePlayer(raw);
    return { supported: true, valid: mapped.valid, accountName: mapped.accountName };
  }

  // ── Compra ────────────────────────────────────────────────────────────────
  async purchase(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    const body: Record<string, unknown> = {
      product_id: numericId(input.externalId),
      // Las órdenes de tipo TOPUP exigen qty=1 (documentado); las de VOUCHER
      // usan la cantidad que pida el input "quantity".
      qty: input.kind === "RECHARGE" ? 1 : Math.max(1, Number(input.inputs.quantity ?? "1") || 1),
      // El webhook de confirmación llega a esta URL, firmado con
      // EPINBY_WEBHOOK_SECRET (ver /api/webhooks/epinby). "events" avisa de
      // PROCESSING además del estado final, no solo al completar.
      callback_url: `${baseUrlString()}/api/webhooks/epinby`,
      callback_mode: "events",
    };

    if (input.kind === "RECHARGE") {
      // input1 = ID de jugador, input2 = Server ID (ver mapper.ts).
      if (!input.inputs.input1) throw new Error("Falta el ID de jugador para un producto de tipo recarga");
      body.player_id = input.inputs.input1;
      if (input.inputs.input2) body.server_id = input.inputs.input2;
    }

    if (isMock()) {
      return mapOrder(mock.mockCreateOrder(input.externalId, input.inputs.input1 ?? "0"));
    }

    const raw = await request<RawOrder>({
      operation: "order.create",
      method: "POST",
      path: "/order",
      body,
      orderId,
      // Reintentar la MISMA orden con la MISMA referencia nunca la duplica
      // del lado de EpinBy — usamos nuestro propio código de orden, igual que
      // `client_name` en RecargasAmérica.
      idempotencyKey: input.clientReference,
    });
    return mapOrder(raw);
  }

  // ── GET /order/{id} — conciliación de órdenes PENDING ─────────────────────
  async getOrderStatus(reference: string, orderId?: string): Promise<OrderStatusResult> {
    if (isMock()) return mapOrder(mock.mockOrderStatus(reference));

    const raw = await request<RawOrder>({
      operation: "order.get",
      method: "GET",
      path: `/order/${encodeURIComponent(reference)}`,
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
        message: "Falta EPINBY_API_KEY en el entorno del servidor.",
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
      logger.warn("Fallo de conexión con EpinBy", { error: (e as Error).message });
      return {
        ok: false,
        configured: true,
        mock: isMock(),
        latencyMs: Date.now() - startedAt,
        balanceCents: null,
        currency: null,
        message: "Fallo de conexión.",
      };
    }
  }
}

function matchesGame(p: RawProduct): boolean {
  return GAME_FILTER.test(p.game ?? "");
}

/** Los IDs de EpinBy son numéricos; si no lo fueran, se envían tal cual. */
function numericId(externalId: string): number | string {
  const n = Number(externalId);
  return Number.isInteger(n) ? n : externalId;
}

export const epinby = new EpinbyService();
export { PROVIDER_CODE };
export type { RawGame };
