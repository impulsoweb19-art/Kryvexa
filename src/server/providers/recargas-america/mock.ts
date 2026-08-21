import type { RawGameProduct, RawOrder, RawPinProduct, RawValidate, RawWallet } from "./mapper";

/**
 * MODO SIMULADO (`PROVIDER_MOCK=true`).
 *
 * Permite desarrollar y probar el flujo completo sin la API key. Las formas de
 * los objetos son EXACTAMENTE las de la documentación oficial; solo los valores
 * son de ejemplo. Cuando llegue la key: `PROVIDER_MOCK=false` y nada más cambia.
 *
 * Este módulo nunca se usa si PROVIDER_MOCK=false. No lleva `server-only`
 * porque son datos inertes (sin secretos) y el script de seed los reutiliza
 * para poblar un catálogo de demostración.
 */

export const mockWallet: RawWallet = { balance: 150.0, currency: "USD" };

const FF_INPUTS = [
  { name: "input1", label: "Player ID" },
  { name: "input2", label: "Server ID" },
];

/**
 * Paquetes de diamantes reales que le pasó el dueño del negocio (en soles,
 * lo que le cuestan a él). El campo `price` de este mock siempre se
 * interpreta como COSTO en dólares (así llega de la API real), así que aquí
 * se guarda ese costo en soles ya convertido a un equivalente en dólares
 * (÷ tipo de cambio 3.8, el mismo que usa la calculadora de precios). Con
 * eso el precio automático del panel (costo × tipo de cambio × margen) sale
 * bien desde el primer momento, y el administrador lo puede ajustar cuando
 * quiera desde Catálogo — nada de esto es definitivo.
 */
export const mockGameProducts: RawGameProduct[] = [
  { id: 1, game: "Free Fire (MY)", package: "110 Diamonds", price: 0.79, input_fields: FF_INPUTS },
  { id: 2, game: "Free Fire (MY)", package: "341 Diamonds", price: 2.24, input_fields: FF_INPUTS },
  { id: 3, game: "Free Fire (MY)", package: "572 Diamonds", price: 3.61, input_fields: FF_INPUTS },
  { id: 4, game: "Free Fire (MY)", package: "1166 Diamonds", price: 6.55, input_fields: FF_INPUTS },
  { id: 5, game: "Free Fire (MY)", package: "2398 Diamonds", price: 13.13, input_fields: FF_INPUTS },
  { id: 6, game: "Free Fire (MY)", package: "6160 Diamonds", price: 32.87, input_fields: FF_INPUTS },
];

export const mockPinProducts: RawPinProduct[] = [
  { id: 20, sku: "FFRC110", name: "Free Fire Recarga 110 Diamantes", type: "recharge", price: 4.1 },
  { id: 21, sku: "FFCH1060", name: "Free Fire 1060 Diamonds", type: "pin", price: 12.5 },
];

/** Un ID que empieza por "9" se considera inexistente: sirve para probar el error. */
export function mockValidate(serviceUserId: string): RawValidate {
  const notFound = serviceUserId.startsWith("9");
  return {
    status: !notFound,
    account_name: notFound ? null : `Jugador${serviceUserId.slice(-4)}`,
  };
}

/**
 * Las referencias simuladas llevan el instante de creación codificado (base36)
 * en vez de guardarlo en una variable de módulo (`Map`/contador en memoria).
 *
 * ¿Por qué? El servidor de desarrollo de Next.js puede volver a evaluar este
 * archivo entre una petición y otra (recarga en caliente, recompilación bajo
 * demanda de otra ruta, etc.), lo que borra cualquier estado en memoria. Con
 * un contador o un `Map` module-level, esa recarga hacía que
 * `mockOrderStatus` dejara de reconocer una referencia que sí había creado
 * unos segundos antes — y, peor aún, la implementación anterior interpretaba
 * "no la reconozco" como "ya se entregó", completando de inmediato órdenes
 * que debían quedar en proceso. Codificar el momento de creación en la propia
 * referencia hace que el cálculo sea el mismo sin importar qué instancia del
 * módulo responda.
 */
function encodeReference(createdAtMs: number): string {
  return `MOCK${createdAtMs.toString(36).toUpperCase()}REF`;
}

function decodeReferenceCreatedAt(reference: string): number | null {
  const match = /^MOCK([0-9A-Z]+)REF$/.exec(reference);
  if (!match) return null;
  const ms = parseInt(match[1], 36);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Un ID terminado en "0" produce una orden PENDING (para probar la
 * conciliación); el resto se completan al instante.
 */
export function mockBuyGames(packageId: string, inputs: Record<string, string>) {
  const playerId = inputs.input1 ?? "";
  const reference = encodeReference(Date.now());
  const product = mockGameProducts.find((p) => String(p.id) === packageId);
  const status = playerId.endsWith("0") ? "PENDING" : "COMPLETED";

  return {
    transaction_id: Date.now(),
    reference,
    status,
    amount_charged: product?.price ?? 0,
    item: status === "COMPLETED" ? `${product?.game} ${product?.package}` : null,
    pins: [],
  };
}

export function mockBuyPins(productId: string) {
  const product = mockPinProducts.find((p) => String(p.id) === productId);
  return {
    transaction_id: Date.now(),
    amount_charged: product?.price ?? 0,
    api_data: {},
  };
}

/** Las órdenes simuladas en PENDING se completan a los 30 segundos. */
export function mockOrderStatus(reference: string): RawOrder {
  const createdAt = decodeReferenceCreatedAt(reference);
  if (createdAt == null) {
    // Referencia que este mock no generó (o que no se pudo leer): igual que
    // con el proveedor real, no reconocer una referencia NUNCA se interpreta
    // como éxito. Se deja en proceso para que la conciliación siga intentando
    // en vez de dar por entregado algo que no podemos confirmar.
    return { reference, status: "PENDING", product: "Free Fire — Paquete", pins: [] };
  }
  const done = Date.now() - createdAt > 30_000;
  return {
    transaction_id: createdAt,
    reference,
    status: done ? "COMPLETED" : "PENDING",
    product: "Free Fire — Paquete",
    pins: [],
  };
}
