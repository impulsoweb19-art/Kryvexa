import "server-only";

import type { ProviderOrderStatus, ProviderProduct } from "../types";

/** Un ítem del catálogo de venta: GET /account/shop/items. */
export interface RawItem {
  id?: string;
  name?: string;
  description?: string | null;
  available?: boolean;
  isActive?: boolean;
  priceUsd?: number;
  effectivePriceUsd?: number;
  onPromo?: boolean;
  iconUrl?: string | null;
  itemType?: string;
  isStackable?: boolean;
  minStack?: number | null;
  maxStack?: number | null;
  minLevel?: number | null;
  availableRegions?: string[];
  category?: { name?: string } | null;
}

/** Un pedido: POST /account/shop/order y GET /account/shop/orders/{id}. */
export interface RawOrder {
  id?: number;
  status?: string;
  itemsPriceUsd?: number;
  totalPriceUsd?: number;
  currencyUsed?: string;
  itemName?: string;
  quantity?: number;
  gameAccount?: { uid?: string; nickname?: string | null; region?: string | null; level?: number };
  walletTransaction?: { amount?: number; newBalance?: number; currency?: string };
  webhook?: { signingSecret?: string; verifyHeader?: string; events?: string[] };
  items?: Array<{ name?: string; itemType?: string; quantity?: number; status?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

/** Sus precios llegan como número decimal de dólares: 4.99 → 499 céntimos. */
export function usdACentimos(valor: number | undefined | null): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.round(valor * 100);
}

/**
 * Traduce los DIEZ estados de SixoFire a los cuatro nuestros.
 *
 * La lista sale de su documentación (sección ord-get). El dueño creía que eran
 * tres —"cola de stock, procesando, completado"—, y dos de los que no conocía
 * son justo los que pueden costar dinero si se tratan mal:
 *
 * `AWAITING_MAIL_CLAIM` — "Pausa por límite de correos Garena; se reanuda
 *   automáticamente". Se parece muchísimo a un fallo, pero NO lo es: si se
 *   diera por fallido y se reembolsara al comprador, Garena entregaría igual
 *   después y la entrega se habría pagado dos veces. Es el mismo límite de
 *   buzón que ya apareció con los Pase Booya en otra tienda.
 *
 * `PARTIAL` — "Al menos una línea completada y otra pendiente o fallida".
 *   Ni entregado ni fallido. Se deja PENDING a propósito: la conciliación lo
 *   reintenta y, si no se resuelve, acaba en NEEDS_REVIEW, que es donde debe
 *   acabar algo que tiene que decidir una persona. Devolver el total o darlo
 *   por bueno serían las dos formas de equivocarse.
 */
export function estadoNormalizado(status: string | undefined): ProviderOrderStatus {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED":
      return "COMPLETED";

    // Terminales y malos. El saldo lo devuelve SixoFire a su propio monedero.
    case "FAILED":
    case "REFUNDED":
      return "FAILED";

    // Todo lo demás sigue su curso: no se toca el dinero del comprador.
    case "PENDING":
    case "AWAITING_PAYMENT":
    case "SCHEDULED":
    case "WAITING_STOCK":
    case "PROCESSING":
    case "AWAITING_MAIL_CLAIM":
    case "PARTIAL":
      return "PENDING";

    /*
      Un estado que no conocemos NO es un fallo. Si mañana añaden uno y lo
      diéramos por fallido, reembolsaríamos compras que sí se entregaron.
      UNKNOWN deja la orden pendiente y la manda a revisión manual.
    */
    default:
      return "UNKNOWN";
  }
}

/**
 * Identificador nuestro para un paquete concreto: `<product_id>x<cantidad>`.
 *
 * Hace falta porque el catálogo de SixoFire y el de la tienda NO son uno a
 * uno. Ellos tienen un solo "Fragmento Universal" con una cantidad variable;
 * el dueño vende cinco paquetes distintos —99, 150, 300, 600 y 1200— que son
 * el mismo ítem con cantidades distintas. Guardar solo el `product_id` dejaría
 * los cinco paquetes indistinguibles.
 *
 * Sigue la misma idea que ya usaban sus artículos manuales
 * (`manual-fragmentos-evo-99`): la cantidad vive en el identificador.
 */
export function externalIdDe(productId: string, cantidad: number): string {
  return `${productId}x${cantidad}`;
}

export function partirExternalId(externalId: string): { productId: string; cantidad: number } {
  const [productId, cantidadTexto] = externalId.split("x");
  const cantidad = Number(cantidadTexto);
  return {
    productId: productId ?? externalId,
    cantidad: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1,
  };
}

/**
 * Un ítem del catálogo, con su precio UNITARIO.
 *
 * Esto es para que el dueño pueda ver desde el panel qué vende SixoFire y con
 * qué `product_id`, no para sincronizar la tienda: por lo dicho arriba, este
 * proveedor NO entra en `SYNCABLE_PROVIDERS`. Sus once artículos ya existen,
 * con los precios y las fotos que él les puso, y se reapuntan a SixoFire sin
 * crear nada nuevo.
 */
export function mapItem(raw: RawItem): ProviderProduct {
  const precio = raw.effectivePriceUsd ?? raw.priceUsd;

  return {
    externalId: String(raw.id ?? ""),
    // El mismo que ya tienen sus artículos manuales. Importa: la clave única
    // de productos es (proveedor, kind, externalId), así que cambiarlo al
    // reapuntarlos a SixoFire crearía filas nuevas en vez de reutilizar las
    // suyas, con sus precios y sus fotos.
    kind: "GAME_PACKAGE",
    sku: raw.id ?? null,
    gameName: raw.category?.name ?? "Free Fire",
    packageName: raw.name ?? "Artículo",
    costUsdCents: usdACentimos(precio),
    inputFields: [{ name: "input1", label: "ID de jugador", type: "number" }],
    // Su API verifica el UID destino al crear el pedido, y además
    // /account/info permite comprobarlo antes de cobrar.
    validationSupported: true,
    active: raw.available === true && raw.isActive === true,
    raw,
  };
}

/**
 * `message` solo se puede mandar en artículos de tipo GIFT. En cualquier otro
 * su API responde 400 `MESSAGE_NOT_APPLICABLE` y el pedido NO se crea.
 *
 * O sea que el "Gracias por elegirnos" que pidió el dueño no se puede enviar a
 * ciegas en los once artículos: hay que mirar el tipo de cada uno. Mandarlo
 * sin comprobar habría tumbado cada compra de los artículos que no sean
 * regalo.
 */
export function aceptaMensaje(raw: RawItem | undefined): boolean {
  return (raw?.itemType ?? "").toUpperCase() === "GIFT";
}

/**
 * Deja la nota del regalo como SixoFire la acepta, o devuelve null si no queda
 * nada que mandar.
 *
 * El texto lo escribe el dueño desde su panel, y allí ya se valida. Esto es la
 * segunda red: si alguna vez entra un valor raro —una importación, una
 * migración, un copiar y pegar con tildes— lo que está en juego no es la nota,
 * es la VENTA. Su API responde 400 y no crea el pedido si el mensaje no le
 * cuadra, así que es mejor entregar sin nota que no entregar.
 *
 * Se quitan tildes y signos en vez de rechazar el texto entero: "¡Gracias!"
 * se convierte en "Gracias" y el cliente recibe algo, que es lo que importa.
 */
export function mensajeSaneado(texto: string | undefined): string | null {
  const limpio = (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes: "á" → "a"
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();

  return limpio.length > 0 ? limpio : null;
}
