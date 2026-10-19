import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Consulta a SixoFire: qué paquetes de nivel y qué ofertas tiene una cuenta
 * de Free Fire.
 *
 * ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
 * Esto SOLO consulta. SixoFire no vende paquetes de nivel —los quitó de su
 * tienda cuando su proveedor dejó de abastecerle— así que la entrega la hace
 * el dueño a mano con otro proveedor. Aquí únicamente se averigua qué tiene
 * disponible el jugador para que sepa qué pedir y el dueño sepa qué entregar.
 *
 * ── POR QUÉ ESTÁ CACHEADO ───────────────────────────────────────────────────
 * Cada consulta EXITOSA descuenta una petición de la cuota mensual, "incluso
 * si el jugador no tiene paquetes disponibles" (su documentación). La
 * suscripción trae 10,000 al mes: sin caché, un curioso que recargue la página
 * diez veces gasta diez, y nadie ha comprado nada.
 *
 * Se cachea por UID. Lo que un jugador tiene disponible no cambia de un minuto
 * a otro, así que media hora de retraso no se la nota nadie y el ahorro es
 * enorme.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Lo que un jugador tiene disponible cambia despacio. */
const CACHE_SEGUNDOS = 1800;

/** Etiqueta propia de cada jugador, para poder tirar SU caché sin tocar la de los demás. */
const etiquetaDe = (uid: string) => `sixoff:${uid}`;

/**
 * Olvida lo que sabíamos de este jugador.
 *
 * Se llama cuando el dueño marca entregado un paquete de promoción: en ese
 * momento Garena deja de ofrecérselo, y si no se tira la caché el jugador lo
 * seguiría viendo disponible media hora más. Es por jugador y no global, para
 * no obligar a reconsultar —y pagar— las cuentas de todos los demás.
 */
export function olvidarCuenta(uid: string) {
  try {
    revalidateTag(etiquetaDe(uid));
  } catch {
    // Fuera de una petición no hay caché que invalidar; la siguiente consulta
    // la refrescará igual cuando caduquen los 30 minutos.
  }
}

export interface PaqueteNivel {
  itemId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface CuentaConsultada {
  uid: string;
  nickname: string | null;
  /** La detecta SixoFire sola; nosotros no la enviamos. */
  region: string | null;
  levelUpAvailable: boolean;
  packages: PaqueteNivel[];
}

export function sixoffConfigurado(): boolean {
  return env().SIXOFF_API_KEY.trim().length > 0;
}

interface Sobre<T> {
  code?: number;
  status?: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Traduce los fallos de SixoFire a algo accionable.
 *
 * La distinción que importa: lo que puede arreglar el comprador (un UID mal
 * escrito) frente a lo que solo puede arreglar el dueño (la cuota agotada, la
 * suscripción vencida). Al comprador se le dice qué hacer; del resto se deja
 * rastro en el log para que el dueño se entere antes que sus clientes.
 */
function traducirFallo(httpStatus: number, codigo: string | undefined): AppError {
  switch (codigo) {
    case "INVALID_UID":
    case "FST_ERR_VALIDATION":
      return new AppError("VALIDATION_ERROR", {
        userMessage: "Ese ID no parece válido. Son solo números, mínimo 8 dígitos.",
      });

    // Problemas de la cuenta del dueño. El comprador no puede hacer nada, así
    // que no se le cuenta el detalle — pero queda en el log bien visible.
    case "SUBSCRIPTION_REQUIRED":
    case "SUBSCRIPTION_REQUESTS_EXHAUSTED":
    case "SUBSCRIPTION_INACTIVE":
    case "PERMISSION_DENIED":
    case "MISSING_API_KEY":
    case "INVALID_API_KEY":
      logger.error("SixoFire rechaza nuestra licencia o cuota", { codigo, httpStatus });
      return new AppError("PROVIDER_NOT_CONFIGURED", {
        userMessage: "La consulta no está disponible ahora mismo. Inténtalo más tarde.",
      });

    default:
      return new AppError("PROVIDER_NOT_CONFIGURED", {
        userMessage:
          httpStatus >= 500
            ? "El servicio de consulta no responde ahora mismo. Inténtalo en unos minutos."
            : "No pudimos consultar esa cuenta. Revisa el ID e inténtalo de nuevo.",
      });
  }
}

async function pedir<T>(ruta: string, params: Record<string, string>): Promise<T> {
  const c = env();
  const url = new URL(ruta, c.SIXOFF_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-API-Key": c.SIXOFF_API_KEY.trim() },
    cache: "no-store",
    signal: AbortSignal.timeout(c.SIXOFF_TIMEOUT_MS),
  });

  const sobre = (await res.json().catch(() => null)) as Sobre<T> | null;

  // Igual que con los demás proveedores: un 200 no basta, se exige status true.
  if (!res.ok || !sobre || sobre.status !== true || sobre.data === undefined) {
    throw traducirFallo(res.status, sobre?.error);
  }
  return sobre.data;
}

interface RespuestaNivel {
  uid?: string;
  nickname?: string | null;
  region?: string | null;
  levelUpAvailable?: boolean;
  availableItemIds?: string[];
  packages?: Array<Partial<PaqueteNivel>>;
}

/**
 * GET /account/levelup/packages
 *
 * Solo se manda el `uid`: la documentación dice expresamente que la región la
 * detecta el propio servicio y que NO se use el parámetro `region` de
 * /account/info. Y de paso este endpoint ya devuelve el nickname, así que
 * sirve también para confirmarle al comprador a qué cuenta está mirando —
 * una consulta menos, media cuota menos.
 */
async function consultarNivelSinCache(uid: string): Promise<CuentaConsultada> {
  const data = await pedir<RespuestaNivel>("/account/levelup/packages", { uid });

  return {
    uid: data.uid ?? uid,
    nickname: data.nickname ?? null,
    region: data.region ?? null,
    levelUpAvailable: data.levelUpAvailable === true,
    packages: (data.packages ?? []).map((p) => ({
      itemId: String(p.itemId ?? ""),
      name: p.name ?? "Paquete de nivel",
      description: p.description ?? null,
      imageUrl: p.imageUrl ?? null,
    })),
  };
}

/**
 * La caché se declara por UID y no con el UID dentro de la clave global, para
 * que cada jugador tenga su propia entrada y no se pisen entre ellos.
 */
export function consultarNivel(uid: string): Promise<CuentaConsultada> {
  return unstable_cache(() => consultarNivelSinCache(uid), ["sixoff-nivel", uid], {
    revalidate: CACHE_SEGUNDOS,
    tags: ["sixoff", etiquetaDe(uid)],
  })();
}

// ── Ofertas RD ───────────────────────────────────────────────────────────────

export interface OfertaRD {
  itemId: string;
  name: string;
  diamonds: number | null;
  /** Porcentaje de descuento sobre el precio original. */
  discountPercent: number | null;
  imageUrl: string | null;
}

interface RespuestaOfertas {
  uid?: string;
  nickname?: string | null;
  region?: string | null;
  shopRegion?: string | null;
  offersAvailable?: boolean;
  offers?: Array<Partial<OfertaRD>>;
}

/**
 * GET /account/offers/rd
 *
 * `lang=es-ES` para que los nombres lleguen en castellano; por defecto el
 * servicio responde en inglés y el comprador leería "100 Diamonds".
 *
 * Los `itemId` son dinámicos según la tienda PayPal de cada cuenta, así que no
 * se pueden mapear contra un catálogo fijo: se muestran tal cual llegan.
 */
async function consultarOfertasSinCache(uid: string): Promise<{
  nickname: string | null;
  region: string | null;
  shopRegion: string | null;
  offersAvailable: boolean;
  offers: OfertaRD[];
}> {
  const data = await pedir<RespuestaOfertas>("/account/offers/rd", { uid, lang: "es-ES" });

  return {
    nickname: data.nickname ?? null,
    region: data.region ?? null,
    shopRegion: data.shopRegion ?? null,
    offersAvailable: data.offersAvailable === true,
    offers: (data.offers ?? []).map((o) => ({
      itemId: String(o.itemId ?? ""),
      name: o.name ?? "Oferta",
      diamonds: typeof o.diamonds === "number" ? o.diamonds : null,
      discountPercent: typeof o.discountPercent === "number" ? o.discountPercent : null,
      imageUrl: o.imageUrl ?? null,
    })),
  };
}

function consultarOfertas(uid: string) {
  return unstable_cache(() => consultarOfertasSinCache(uid), ["sixoff-ofertas", uid], {
    revalidate: CACHE_SEGUNDOS,
    tags: ["sixoff", etiquetaDe(uid)],
  })();
}

// ── Consulta completa ────────────────────────────────────────────────────────

export interface ResultadoConsulta {
  uid: string;
  nickname: string | null;
  region: string | null;
  levelUpAvailable: boolean;
  packages: PaqueteNivel[];
  offersAvailable: boolean;
  offers: OfertaRD[];
  /** Qué mitad de la consulta falló, si alguna. */
  faltaNivel: boolean;
  faltaOfertas: boolean;
}

/**
 * Las dos consultas a la vez.
 *
 * Son dos peticiones de cuota, una por cada permiso, y no se pueden fusionar:
 * son endpoints distintos. Van en paralelo para que el comprador no espere el
 * doble.
 *
 * Si una falla y la otra no, se muestra lo que haya. Enseñar los paquetes de
 * nivel y avisar de que las ofertas no cargaron es más útil que una pantalla
 * de error con la que nadie puede hacer nada — y la consulta buena ya se pagó.
 */
export async function consultarCuenta(uid: string): Promise<ResultadoConsulta> {
  if (!sixoffConfigurado()) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      userMessage: "La consulta no está disponible ahora mismo.",
    });
  }

  const [nivel, ofertas] = await Promise.allSettled([consultarNivel(uid), consultarOfertas(uid)]);

  // Si fallan las DOS, no hay nada que enseñar: se propaga el error de la
  // primera para que el comprador vea un motivo y no una pantalla vacía.
  if (nivel.status === "rejected" && ofertas.status === "rejected") {
    throw nivel.reason;
  }

  const n = nivel.status === "fulfilled" ? nivel.value : null;
  const o = ofertas.status === "fulfilled" ? ofertas.value : null;

  if (!n) logger.warn("SixoFire: falló la consulta de paquetes de nivel", { uid });
  if (!o) logger.warn("SixoFire: falló la consulta de ofertas RD", { uid });

  return {
    uid,
    nickname: n?.nickname ?? o?.nickname ?? null,
    region: n?.region ?? o?.region ?? null,
    levelUpAvailable: n?.levelUpAvailable ?? false,
    packages: n?.packages ?? [],
    offersAvailable: o?.offersAvailable ?? false,
    offers: o?.offers ?? [],
    faltaNivel: !n,
    faltaOfertas: !o,
  };
}

// ── Enlace con el catálogo ───────────────────────────────────────────────────

/**
 * Convención que une una promoción de Garena con el artículo que la vende.
 *
 * Las promociones NO son productos de la tienda: son lo que Garena le ofrece a
 * esa cuenta concreta. Para que el comprador pueda pagarlas con su saldo, el
 * dueño crea un artículo manual por cada una con este `externalId`, le pone el
 * precio que quiera desde su panel, y aquí se cruzan.
 *
 * Los paquetes de nivel tienen catálogo fijo (4790…4795), así que se atan por
 * `itemId`. Las ofertas RD no: sus IDs cambian según la tienda PayPal de cada
 * cuenta, así que se atan por la CANTIDAD DE DIAMANTES, que sí es estable.
 */
export const externalIdDeNivel = (itemId: string) => `manual-levelup-${itemId}`;
export const externalIdDeOferta = (diamonds: number) => `manual-oferta-rd-${diamonds}`;

/** Lo que necesita el botón de comprar. */
export interface Comprable {
  productId: string;
  priceCents: number;
}

/**
 * Comprueba, ANTES de cobrar, que ese jugador de verdad tiene esa promoción.
 *
 * No basta con que la pantalla de consulta la haya mostrado. Quien tenga el
 * enlace directo del artículo puede entrar sin pasar por la consulta, y el
 * dueño no puede entregar una promoción que Garena no le ofrece a esa cuenta:
 * acabaría devolviendo el dinero y quedando mal.
 *
 * En la práctica casi nunca cuesta cuota: el comprador acaba de consultar y la
 * respuesta sigue en la caché de media hora.
 *
 * Si la comprobación no se puede hacer, se BLOQUEA la compra. Vender algo que
 * no se va a poder entregar es peor que perder una venta.
 */
export async function asegurarPromocionDisponible(
  externalId: string,
  uid: string | undefined,
): Promise<void> {
  if (!uid || !/^[0-9]{8,15}$/.test(uid)) {
    throw new AppError("VALIDATION_ERROR", {
      userMessage: "Necesitamos tu ID de jugador para comprobar esta promoción.",
    });
  }

  let cuenta: ResultadoConsulta;
  try {
    cuenta = await consultarCuenta(uid);
  } catch {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      userMessage:
        "No pudimos comprobar si tu cuenta tiene esta promoción. Inténtalo en unos minutos; " +
        "no te hemos cobrado nada.",
    });
  }

  const nivel = externalId.startsWith("manual-levelup-")
    ? externalId.slice("manual-levelup-".length)
    : null;
  if (nivel) {
    if (cuenta.faltaNivel) throw noSePudoComprobar();
    if (!cuenta.packages.some((p) => p.itemId === nivel)) throw noDisponible();
    return;
  }

  const diamantes = Number(externalId.slice("manual-oferta-rd-".length));
  if (cuenta.faltaOfertas) throw noSePudoComprobar();
  if (!cuenta.offers.some((o) => o.diamonds === diamantes)) throw noDisponible();
}

function noSePudoComprobar() {
  return new AppError("PROVIDER_NOT_CONFIGURED", {
    userMessage:
      "No pudimos comprobar si tu cuenta tiene esta promoción. Inténtalo en unos minutos; " +
      "no te hemos cobrado nada.",
  });
}

function noDisponible() {
  return new AppError("PRODUCT_UNAVAILABLE", {
    userMessage:
      "Tu cuenta no tiene esta promoción disponible. Estas ofertas dependen de cada cuenta: " +
      "consulta las tuyas en Mis promociones.",
  });
}
