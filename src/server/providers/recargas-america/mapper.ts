import "server-only";

import type { ProductKind } from "@/db/schema";
import type {
  OrderStatusResult,
  ProviderInputField,
  ProviderOrderStatus,
  ProviderProduct,
  PurchaseResult,
} from "../types";

/**
 * Traducción entre las respuestas CRUDAS de RecargasAmérica y nuestros tipos.
 *
 * Las formas de aquí salen literalmente de la colección Postman entregada por
 * el cliente. No se inventa ningún campo: lo que no está documentado se trata
 * como opcional y se degrada con seguridad.
 */

// ── Formas crudas documentadas ───────────────────────────────────────────────

export interface RawWallet {
  balance: number;
  currency: string;
}

export interface RawGameProduct {
  id: number | string;
  game: string;
  package: string;
  price: number;
  input_fields?: Array<{ name: string; label: string }>;
}

export interface RawPinProduct {
  id: number | string;
  sku?: string;
  name: string;
  /** Documentado en la descripción de /buy/pins. Ausente en el ejemplo → fallback "pin". */
  type?: string;
  price: number;
}

export interface RawBuyGames {
  transaction_id?: number | string;
  reference?: string;
  status?: string;
  amount_charged?: number;
  item?: string | null;
  pins?: string[];
}

export interface RawBuyPins {
  transaction_id?: number | string;
  amount_charged?: number;
  api_data?: unknown;
  /** No documentado para este endpoint, pero si llegara lo aprovechamos. */
  reference?: string;
  status?: string;
  pins?: string[];
}

export interface RawValidate {
  status: boolean;
  account_name: string | null;
}

/**
 * GET /products/catalog — el catálogo unificado que reemplaza a
 * /products/games y /products/pins desde el 2026-09-20.
 *
 * Su `id`/`sku` no cambia aunque el proveedor que cumple la compra sí lo haga;
 * por eso sustituye a los IDs viejos, que eran por proveedor.
 */
export interface RawCatalogProduct {
  id: number | string;
  sku?: string;
  name: string;
  type?: string;
  price: number;
  /** Nombres canónicos: player_id, zone_id, manual_id, server_id, username. */
  required_fields?: string[];
}

/** POST /buy/catalog. No trae `reference`, sino `order_id`. */
export interface RawBuyCatalog {
  transaction_id?: number | string;
  order_id?: string;
  status?: string;
  amount_charged?: number;
  item?: string | null;
}

/** POST /catalog/validate. `supported:false` = el proveedor ganador no hace precheck. */
export interface RawCatalogValidate {
  supported?: boolean;
  status?: boolean;
  account_name?: string | null;
}

export interface RawOrder {
  transaction_id?: number | string;
  reference?: string;
  status?: string;
  product?: string;
  pins?: string[];
}

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Los precios llegan como decimales (3.74). A céntimos, sin errores de coma flotante. */
export function priceToUsdCents(price: unknown): number {
  const n = typeof price === "string" ? Number(price) : (price as number);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Precio del proveedor inválido: ${JSON.stringify(price)}`);
  }
  return Math.round(n * 100);
}

const asString = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/**
 * Normaliza el `status` textual del proveedor a NUESTRO vocabulario cerrado.
 * Cualquier valor no reconocido cae en "UNKNOWN": preferimos revisar a mano
 * antes que dar por buena una entrega que quizá no ocurrió.
 */
export function mapProviderStatus(status: unknown): ProviderOrderStatus {
  const s = String(status ?? "").trim().toUpperCase();
  switch (s) {
    case "COMPLETED":
    case "SUCCESS":
    case "COMPLETADO":
      return "COMPLETED";
    case "PENDING":
    case "PROCESSING":
    case "IN_PROGRESS":
      return "PENDING";
    case "PROCESSING_PROVIDER":
      // El catálogo unificado lo devuelve cuando el proveedor que gana la
      // compra es asíncrono: la orden sigue viva, no ha fallado.
      return "PENDING";
    case "FAILED":
    case "ERROR":
    case "CANCELLED":
    case "CANCELED":
    case "REJECTED":
      return "FAILED";
    default:
      return "UNKNOWN";
  }
}

// ── Mapeos ───────────────────────────────────────────────────────────────────

/** Extrae el juego del nombre plano ("Free Fire 1060 Diamonds" → "Free Fire"). */
function guessGameName(name: string): string {
  const m = /^(free\s*fire|mobile\s*legends|pubg\s*mobile|call\s*of\s*duty)/i.exec(name ?? "");
  return m ? m[1].replace(/\s+/g, " ") : (name ?? "Producto").split(" ").slice(0, 2).join(" ");
}

/**
 * Etiquetas de los campos canónicos del catálogo unificado. El `name` se
 * conserva tal cual porque es lo que espera /buy/catalog; aquí solo se le pone
 * un texto entendible para el comprador.
 */
const CATALOG_FIELD_LABELS: Record<string, { label: string; type: "text" | "number" }> = {
  player_id: { label: "ID de jugador", type: "number" },
  zone_id: { label: "ID de zona", type: "number" },
  server_id: { label: "ID de servidor", type: "number" },
  manual_id: { label: "ID de cuenta", type: "text" },
  username: { label: "Usuario", type: "text" },
};

export function catalogKind(raw: RawCatalogProduct): ProductKind {
  return String(raw.type ?? "recharge").toLowerCase() === "pin" ? "PIN" : "RECHARGE";
}

export function mapCatalogProduct(raw: RawCatalogProduct): ProviderProduct {
  const kind = catalogKind(raw);
  const required = Array.isArray(raw.required_fields) ? raw.required_fields : [];

  // Un PIN no pide datos del jugador: se compra por cantidad.
  const inputFields: ProviderInputField[] =
    kind === "PIN" && required.length === 0
      ? [{ name: "quantity", label: "Cantidad", type: "number" }]
      : required.map((name) => {
          const known = CATALOG_FIELD_LABELS[name];
          return { name, label: known?.label ?? name, type: known?.type ?? "text" };
        });

  return {
    externalId: String(raw.id),
    kind,
    sku: raw.sku ?? null,
    gameName: guessGameName(raw.name),
    packageName: raw.name,
    costUsdCents: priceToUsdCents(raw.price),
    inputFields,
    // /catalog/validate acepta cualquier producto, pero responde
    // `supported:false` si el proveedor ganador no hace precheck. Se ofrece
    // solo en recargas; el adaptador trata esa respuesta como "sin dato".
    validationSupported: kind === "RECHARGE",
    active: true,
    raw,
  };
}

export function mapBuyCatalog(raw: RawBuyCatalog): PurchaseResult {
  return {
    status: mapProviderStatus(raw.status),
    // El catálogo llama `order_id` a lo que el endpoint viejo llamaba
    // `reference`. Es lo que guardamos para poder conciliar después.
    reference: asString(raw.order_id),
    transactionId: asString(raw.transaction_id),
    chargedUsdCents: raw.amount_charged !== undefined ? priceToUsdCents(raw.amount_charged) : null,
    item: raw.item ?? null,
    pins: [],
    raw,
  };
}

export function mapOrder(raw: RawOrder): OrderStatusResult {
  return {
    status: mapProviderStatus(raw.status),
    reference: asString(raw.reference),
    transactionId: asString(raw.transaction_id),
    item: raw.product ?? null,
    pins: Array.isArray(raw.pins) ? raw.pins.map(String) : [],
    raw,
  };
}
