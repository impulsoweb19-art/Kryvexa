import "server-only";

import type { ProductKind } from "@/db/schema";
import type { OrderStatusResult, ProviderOrderStatus, ProviderProduct, PurchaseResult } from "../types";

/**
 * Traducción entre las respuestas CRUDAS de EpinBy y nuestros tipos.
 *
 * Las formas de aquí salen literalmente de https://epinby.com/docs. Igual que
 * con RecargasAmérica: lo no documentado se trata como opcional.
 */

// ── Formas crudas documentadas ───────────────────────────────────────────────

export interface RawGame {
  id: number;
  name: string;
}

export interface RawProduct {
  id: number;
  name: string;
  game_id: number;
  game: string;
  category_id: number;
  category: string;
  type: "VOUCHER" | "TOPUP" | string;
  price: string; // "9.9900" — decimal en texto
  stock_status: "FINITE" | "UNLIMITED" | string;
  stock_count: number | null;
  fields: Array<{ name: string; label: string }>;
  supports_player_validation: boolean;
}

export interface RawValidatePlayer {
  nickname: string;
  player_name: string;
  region: string | null;
  server_id: string | null;
  nickname_verified: boolean;
  validation_optional: boolean;
}

export interface RawOrder {
  order_id: number;
  client_order_id?: string;
  status: string; // PENDING | PROCESSING | COMPLETED | CANCELED | FAILED
  price?: string;
  player?: { nickname?: string; player_name?: string } | null;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Los precios de EpinBy llegan como texto decimal ("9.9900"). A céntimos, sin errores de coma flotante. */
export function priceToUsdCents(price: unknown): number {
  const n = typeof price === "string" ? Number(price) : (price as number);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Precio de EpinBy inválido: ${JSON.stringify(price)}`);
  }
  return Math.round(n * 100);
}

const asString = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/**
 * Normaliza el `status` de EpinBy a nuestro vocabulario cerrado.
 * PENDING/PROCESSING se tratan igual: la orden sigue en curso, la
 * conciliación (o el webhook) la va a volver a consultar.
 */
export function mapProviderStatus(status: unknown): ProviderOrderStatus {
  const s = String(status ?? "").trim().toUpperCase();
  switch (s) {
    case "COMPLETED":
      return "COMPLETED";
    case "PENDING":
    case "PROCESSING":
      return "PENDING";
    case "FAILED":
    case "CANCELED":
    case "CANCELLED":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

/** Solo type=TOPUP admite POST /validate-player (documentado). */
export function productKind(raw: RawProduct): ProductKind {
  return raw.type === "TOPUP" ? "RECHARGE" : "PIN";
}

export function mapProduct(raw: RawProduct): ProviderProduct {
  const kind = productKind(raw);

  return {
    externalId: String(raw.id),
    kind,
    sku: null,
    gameName: raw.game || "Desconocido",
    packageName: raw.name,
    costUsdCents: priceToUsdCents(raw.price),
    // Se usan los mismos nombres de campo que RecargasAmérica (input1/input2,
    // quantity): el esquema de validación de `createOrderSchema` solo admite
    // esa lista fija, y así no hace falta tocarlo por un proveedor más.
    // TOPUP siempre necesita el ID del jugador; el server/zona lo pide la
    // documentación como "opcional según el juego" — para Mobile Legends sí
    // aplica (UID + Server ID), así que se ofrece siempre y el jugador lo
    // completa cuando corresponda.
    inputFields:
      kind === "RECHARGE"
        ? [
            { name: "input1", label: "ID de jugador", type: "number" },
            { name: "input2", label: "Server ID", type: "text" },
          ]
        : [{ name: "quantity", label: "Cantidad", type: "number" }],
    validationSupported: raw.supports_player_validation === true,
    active: raw.stock_status !== "FINITE" || (raw.stock_count ?? 1) > 0,
    raw,
  };
}

export function mapValidatePlayer(raw: RawValidatePlayer): { valid: boolean; accountName: string | null } {
  return {
    valid: raw.nickname_verified === true || raw.validation_optional === true,
    accountName: raw.nickname || raw.player_name || null,
  };
}

export function mapOrder(raw: RawOrder): PurchaseResult & OrderStatusResult {
  return {
    status: mapProviderStatus(raw.status),
    reference: asString(raw.order_id),
    transactionId: asString(raw.order_id),
    chargedUsdCents: raw.price !== undefined ? priceToUsdCents(raw.price) : null,
    item: raw.player?.nickname ?? raw.player?.player_name ?? null,
    pins: [],
    raw,
  };
}
