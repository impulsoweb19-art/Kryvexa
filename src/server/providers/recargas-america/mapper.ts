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

/**
 * Detecta si un producto de /products/pins es de tipo recarga.
 * Solo estos admiten el precheck POST /pins/validate (documentado).
 */
export function pinKind(raw: RawPinProduct): ProductKind {
  return String(raw.type ?? "pin").toLowerCase() === "recharge" ? "RECHARGE" : "PIN";
}

function normalizeInputFields(fields: RawGameProduct["input_fields"]): ProviderInputField[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    // La API es la fuente de verdad. Si no declara campos, no inventamos ninguno:
    // la UI mostrará un aviso y el admin deberá revisar el producto.
    return [];
  }
  return fields
    .filter((f) => f && typeof f.name === "string")
    .map((f) => ({
      name: f.name,
      label: typeof f.label === "string" && f.label.trim() ? f.label : f.name,
      // Los IDs de jugador de Free Fire son numéricos: mejor teclado en móvil.
      type: /id$/i.test(f.label ?? "") ? "number" : "text",
      placeholder: undefined,
    }));
}

// ── Mapeos ───────────────────────────────────────────────────────────────────

export function mapGameProduct(raw: RawGameProduct): ProviderProduct {
  return {
    externalId: String(raw.id),
    kind: "GAME_PACKAGE",
    sku: null,
    gameName: raw.game ?? "Desconocido",
    packageName: raw.package ?? "Paquete",
    costUsdCents: priceToUsdCents(raw.price),
    inputFields: normalizeInputFields(raw.input_fields),
    // La documentación limita POST /pins/validate a productos de /products/pins
    // con type=recharge. Para los paquetes de juego NO hay validación documentada.
    validationSupported: false,
    active: true,
    raw,
  };
}

export function mapPinProduct(raw: RawPinProduct): ProviderProduct {
  const kind = pinKind(raw);
  return {
    externalId: String(raw.id),
    kind,
    sku: raw.sku ?? null,
    // /products/pins no separa juego y paquete: usamos el nombre completo.
    gameName: guessGameName(raw.name),
    packageName: raw.name,
    costUsdCents: priceToUsdCents(raw.price),
    inputFields:
      kind === "RECHARGE"
        ? [{ name: "redemption_id", label: "ID de jugador", type: "number" }]
        : [{ name: "quantity", label: "Cantidad", type: "number" }],
    validationSupported: kind === "RECHARGE",
    active: true,
    raw,
  };
}

/** Extrae el juego del nombre plano ("Free Fire 1060 Diamonds" → "Free Fire"). */
function guessGameName(name: string): string {
  const m = /^(free\s*fire|mobile\s*legends|pubg\s*mobile|call\s*of\s*duty)/i.exec(name ?? "");
  return m ? m[1].replace(/\s+/g, " ") : (name ?? "Producto").split(" ").slice(0, 2).join(" ");
}

export function mapBuyGames(raw: RawBuyGames): PurchaseResult {
  return {
    status: mapProviderStatus(raw.status),
    reference: asString(raw.reference),
    transactionId: asString(raw.transaction_id),
    chargedUsdCents: raw.amount_charged !== undefined ? priceToUsdCents(raw.amount_charged) : null,
    item: raw.item ?? null,
    pins: Array.isArray(raw.pins) ? raw.pins.map(String) : [],
    raw,
  };
}

export function mapBuyPins(raw: RawBuyPins): PurchaseResult {
  // /buy/pins no documenta `status`: una respuesta success:true significa
  // entregado. Si algún día empieza a devolver status, lo respetamos.
  const status = raw.status ? mapProviderStatus(raw.status) : "COMPLETED";
  return {
    status,
    reference: asString(raw.reference),
    transactionId: asString(raw.transaction_id),
    chargedUsdCents: raw.amount_charged !== undefined ? priceToUsdCents(raw.amount_charged) : null,
    item: null,
    pins: Array.isArray(raw.pins) ? raw.pins.map(String) : [],
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
