/**
 * Utilidades de dinero. Todo en enteros (céntimos) para evitar los errores de
 * redondeo del punto flotante. Este módulo es isomorfo (cliente y servidor).
 */

/** 1000 basis points = 10 %. */
export type Bps = number;

export function formatPEN(cents: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** "12.50" | 12.5 → 1250. Lanza si no es un número válido. */
export function toCents(value: string | number): number {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (!Number.isFinite(n)) throw new Error(`Importe inválido: ${value}`);
  return Math.round(n * 100);
}

export const fromCents = (cents: number): number => cents / 100;

/**
 * Precio de venta en céntimos de PEN a partir del costo del proveedor.
 *
 *   costo(USD) × tipoDeCambio × (1 + margen)
 *
 * @param costUsdCents  precio del proveedor en céntimos de USD
 * @param exchangeRate  soles por dólar (p. ej. 3.85)
 * @param marginBps     margen en basis points (2500 = 25 %)
 * @param roundToCents  múltiplo al que se redondea hacia arriba (10 = a S/ 0.10)
 */
export function computeSellPriceCents(
  costUsdCents: number,
  exchangeRate: number,
  marginBps: Bps,
  roundToCents = 10,
): number {
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("El tipo de cambio debe ser un número mayor que cero");
  }
  const raw = costUsdCents * exchangeRate * (1 + marginBps / 10_000);
  const step = Math.max(1, Math.round(roundToCents));
  // Redondeo hacia arriba: nunca vendemos por debajo del margen configurado.
  return Math.ceil(raw / step) * step;
}

/** Margen real obtenido, en basis points, dado un precio y un costo. */
export function effectiveMarginBps(
  priceCents: number,
  costUsdCents: number,
  exchangeRate: number,
): number {
  const costPen = costUsdCents * exchangeRate;
  if (costPen <= 0) return 0;
  return Math.round((priceCents / costPen - 1) * 10_000);
}
