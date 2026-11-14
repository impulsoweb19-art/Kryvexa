import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Consulta a SixoFire: qué paquetes de nivel y qué ofertas tiene una cuenta
 * de Free Fire.
 *
 * ── ESTE MÓDULO NO LO LLAMA NADIE (14/11/2026) ──────────────────────────────
 * El dueño mandó retirar las promociones de cuenta porque llevaban semanas sin
 * funcionar, y la causa está confirmada: SixoFire no consigue abrir sesión
 * contra Garena, y sus endpoints de promociones responden una frase de error
 * en vez de un código. No es nuestro, y no se arregla desde aquí.
 *
 * Se conserva —en vez de borrarlo— porque el dueño quiere entrega automática
 * de pases y fragmentos Evo a través de la TIENDA de SixoFire, que es otra
 * parte de su API y sí funciona. Ese trabajo reutiliza lo único que aquí
 * quedó probado contra la API real: `pedir`, `traducirFallo` con sus códigos
 * verificados, y `/account/info`, que responde bien incluso cuando las
 * promociones no y es lo que valida el ID del jugador.
 *
 * Si ese trabajo no se hace, este archivo se borra entero en un commit.
 * ────────────────────────────────────────────────────────────────────────────
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
  /*
    Esto va ANTES del switch porque SixoFire no siempre manda un código. Para
    el fallo más frecuente de todos manda una frase entera en inglés metida en
    el campo `error`:

      "UID not found or failed to generate valid session after multiple attempts"

    Ningún `case` puede casar eso, así que hasta el 3/11/2026 todos estos
    fallos acababan en la rama por defecto y el comprador leía "revisa el ID".

    El "UID not found" del principio es ruido suyo, y se comprobó: la cuenta
    2556383367 devuelve ese error en promociones mientras su propio
    /account/info la da por buena —nivel 81, región SAC, con nickname—. Lo que
    falla es la sesión que ELLOS abren contra Garena para leer las
    promociones, no el ID que escribió el comprador. Echarle la culpa a él es
    mandarlo a corregir algo que está bien.
  */
  if (codigo && /failed to generate valid session/i.test(codigo)) {
    return new AppError("PROVIDER_NOT_CONFIGURED", {
      userMessage:
        "No pudimos consultar las promociones de esa cuenta. Comprueba que el ID sea " +
        "correcto; si lo es, el servicio está saturado e inténtalo en unos minutos.",
    });
  }

  switch (codigo) {
    /*
      OJO con FST_ERR_VALIDATION: no significa "UID inválido". Es el error
      genérico de validación de esquema de Fastify, y el 2/11/2026 se
      comprobó que lo devuelven también cuando falta una cabecera:

        {"status":false,"code":400,"error":"FST_ERR_VALIDATION",
         "message":"headers must have required property 'x-api-key'","data":null}

      Se deja aquí porque, con la petición bien formada, lo único que puede
      fallar la validación es el uid. Pero si este caso llegara a saltar por
      otra cosa, le estaríamos echando la culpa al comprador por un fallo
      nuestro — y por eso `pedir` registra `message`, que es lo que distingue
      un uid malo de una cabecera que no llegó.
    */
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

    /*
      No es NUESTRO límite de 60/min: su mensaje es "Garena API rate limit
      reached.", o sea que el que les está frenando es Garena. No lo arregla
      ni el dueño ni el comprador, solo se pasa con el tiempo.

      Se registra como aviso y no como error porque no hay nada roto: es la
      cola de un servicio compartido.
    */
    /*
      La ÚNICA respuesta suya que significa de verdad "ese ID no existe", y
      solo la devuelve /account/info (404). Las promociones nunca la mandan:
      ahí todo llega mezclado en la frase de la sesión. Es la pieza que
      permite acusar al comprador de equivocarse sólo cuando se equivocó.
    */
    case "ACCOUNT_NOT_FOUND":
      return new AppError("INVALID_PLAYER_ID", {
        userMessage:
          "No encontramos ninguna cuenta de Free Fire con ese ID. Revísalo y vuelve a intentarlo.",
      });

    case "RATE_LIMIT_EXCEEDED":
      logger.warn("Garena está limitando las consultas de SixoFire", { httpStatus });
      return new AppError("PROVIDER_NOT_CONFIGURED", {
        userMessage:
          "Hay mucha demanda de consultas en este momento. Espera unos minutos y " +
          "vuelve a intentarlo; tu ID está bien.",
      });

    /*
      Aquí cae TODO lo que no reconocemos, y por eso el mensaje ya no afirma
      que el ID esté mal.

      Decía "Revisa el ID e inténtalo de nuevo" para cualquier fallo por
      debajo de 500, viniera de donde viniera. El dueño reportó el 2/11/2026
      que a unas cuentas "no les deja revisar el ID y otras sí con
      normalidad": el comprador leía que su ID estaba mal, lo volvía a
      escribir igual de bien, y volvía a fallar. Mandar a alguien a arreglar
      algo que no está roto es peor que admitir que no sabemos.

      Quién tiene de verdad la culpa lo dirá el log de `pedir`, que ahora
      guarda el código tal cual lo manda SixoFire.
    */
    default:
      return new AppError("PROVIDER_NOT_CONFIGURED", {
        userMessage:
          httpStatus >= 500
            ? "El servicio de consulta no responde ahora mismo. Inténtalo en unos minutos."
            : "No pudimos consultar esa cuenta. Comprueba que el ID sea correcto; si lo es, " +
              "vuelve a intentarlo en unos minutos.",
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
    /*
      Se deja rastro ANTES de traducir, y de todos los fallos, no solo de los
      que sabemos nombrar.

      Hasta ahora una consulta rechazada podía no dejar ni una línea: el
      traductor solo escribía en el log cuando reconocía el código, y
      `consultarCuenta` se salta sus dos avisos justo cuando fallan las dos
      mitades a la vez — que es exactamente el caso en el que el comprador ve
      un error. El único rastro era un PROVIDER_NOT_CONFIGURED genérico, sin
      cuenta, sin endpoint y sin motivo: nada con lo que empezar a mirar.

      Se comprobó el 2/11/2026 contra su API que el código viaja en `error` y
      la descripción en `message`:

        {"status":false,"code":401,"error":"INVALID_API_KEY",
         "message":"Invalid or inactive API key.","data":null}

      Es decir, leer `error` es correcto y los nombres de este switch son los
      suyos, no una invención nuestra. Así que un fallo que acabe en la rama
      por defecto significa una cosa sola: mandan un código que todavía no
      conocemos. `message` es lo que nos dirá cuál sin tener que adivinar.
    */
    logger.warn("SixoFire rechazó la consulta", {
      ruta,
      uid: params.uid ?? null,
      httpStatus: res.status,
      codigo: sobre?.error ?? null,
      mensaje: sobre?.message ?? null,
    });

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

interface RespuestaInfo {
  basicInfo?: { accountId?: string; nickname?: string | null; region?: string | null };
}

/**
 * ¿Existe esta cuenta? `true`, `false`, o `null` cuando no se pudo averiguar.
 *
 * Usa /account/info, un permiso que la licencia ya tenía y que no gastábamos:
 * su contador seguía intacto en 10,000 mientras los otros dos iban por 1,030.
 *
 * Hace falta porque el fallo habitual de las promociones llega como
 * "UID not found or failed to generate valid session after multiple attempts",
 * una sola frase que mezcla las dos causas. Sin preguntar aparte, o acusamos
 * al comprador de escribir mal un ID que estaba perfecto —que es justo la
 * queja del 2/11/2026—, o mandamos a "volver en unos minutos" a alguien que
 * tecleó mal y va a volver eternamente.
 */
async function cuentaExiste(uid: string): Promise<boolean | null> {
  try {
    const info = await pedir<RespuestaInfo>("/account/info", { uid });
    return Boolean(info?.basicInfo?.accountId);
  } catch (e) {
    if (e instanceof AppError && e.code === "INVALID_PLAYER_ID") return false;
    // Cualquier otro fallo —el límite de Garena, por ejemplo— es "no sabemos".
    // Decir que la cuenta no existe porque no pudimos preguntar sería repetir
    // el mismo error con otra cara.
    return null;
  }
}

/**
 * Convierte "falló todo" en el motivo concreto, preguntando quién tiene la culpa.
 *
 * Solo se llama cuando las dos mitades fallaron, que es el único caso en el
 * que el comprador se queda con una pantalla de error. Es una petición de más,
 * pero de un cupo aparte y solo cuando ya hay un problema.
 */
async function precisarFallo(motivo: unknown, uid: string): Promise<unknown> {
  const existe = await cuentaExiste(uid);

  if (existe === false) {
    return new AppError("INVALID_PLAYER_ID", {
      userMessage:
        "No encontramos ninguna cuenta de Free Fire con ese ID. Revísalo y vuelve a intentarlo.",
    });
  }

  if (existe === true) {
    return new AppError("PROVIDER_NOT_CONFIGURED", {
      userMessage:
        "Tu ID está bien y encontramos tu cuenta, pero ahora mismo no podemos leer sus " +
        "promociones. Es cosa del servicio, no tuya: inténtalo de nuevo en unos minutos.",
    });
  }

  return motivo;
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
  //
  // El aviso va aquí y no más abajo porque los dos `logger.warn` del final
  // quedan detrás de este `throw`: el único caso en el que el comprador se
  // queda sin nada era justo el único que no se anotaba.
  if (nivel.status === "rejected" && ofertas.status === "rejected") {
    logger.warn("SixoFire: la consulta falló entera, el comprador no vio nada", { uid });
    throw await precisarFallo(nivel.reason, uid);
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
