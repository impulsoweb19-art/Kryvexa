import "server-only";

import { db } from "@/db";
import { providerTransactions } from "@/db/schema";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";
import { ProviderRequestError } from "../types";
import { opcionesDeSalida } from "../salida";

/**
 * Cliente HTTP de la TIENDA de SixoFire.
 *
 * Documentación: https://sixoff.com/docs (secciones ord-items, ord-new,
 * ord-get). Autenticación por cabecera `X-API-Key`, igual que el resto de su
 * API.
 *
 * ── QUÉ PARTE DE SIXOFIRE ES ESTA ───────────────────────────────────────────
 * SixoFire tiene dos formas de entregar, y NO son intercambiables:
 *
 *   · Tienda (esta):    POST /account/shop/order. Cobra del monedero GENERAL
 *                       en dólares, del panel del dueño.
 *   · Envío de regalos: POST /account/gift/send. Cobra DIAMANTES de una cuenta
 *                       de Garena, y para eso exige el UID y la contraseña de
 *                       esa cuenta sacados de un archivo `guest*.dat`.
 *
 * Usamos la tienda, y la licencia NO debe llevar el permiso `GIFT_SEND`: no
 * hace falta para nada de lo que hacemos y entregarle las credenciales de una
 * cuenta de juego a un tercero es un riesgo que no tenemos por qué correr. Su
 * propia documentación lo separa: "No uses JWT ni diamantes del juego — eso es
 * Envío de regalos".
 *
 * Permisos necesarios y suficientes: `SHOP_ORDER` y `ACCOUNT_INFO`.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const PROVIDER_CODE = "sixoff";

/**
 * Sobre estándar de SixoFire. Comprobado contra su API el 3/11/2026:
 *
 *   {"status":false,"code":401,"error":"INVALID_API_KEY",
 *    "message":"Invalid or inactive API key.","data":null}
 *
 * El CÓDIGO viaja en `error` y la descripción humana en `message`. Importa
 * tenerlo claro porque en sus endpoints de promociones (los que se retiraron)
 * mandaban una frase entera dentro de `error`, y eso hacía ilegible cualquier
 * clasificación por código.
 */
export interface Sobre<T> {
  code?: number;
  status?: boolean;
  message?: string;
  error?: string;
  data?: T;
}

interface RequestOptions {
  operation: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  orderId?: string;
  timeoutMs?: number;
}

function config() {
  const e = env();
  return {
    baseUrl: e.SIXOFF_BASE_URL.replace(/\/+$/, ""),
    apiKey: e.SIXOFF_API_KEY.trim(),
    timeoutMs: e.SIXOFF_TIMEOUT_MS,
  };
}

export function isConfigured(): boolean {
  return config().apiKey.length > 0;
}

export function baseUrl(): string {
  return config().baseUrl;
}

/** Persiste la llamada para auditoría. Nunca hace fallar la operación. */
async function log(entry: {
  operation: string;
  method: string;
  endpoint: string;
  requestBody?: unknown;
  responseBody?: unknown;
  httpStatus: number | null;
  ok: boolean;
  errorMessage?: string | null;
  durationMs: number;
  orderId?: string;
}) {
  try {
    await db.insert(providerTransactions).values({
      orderId: entry.orderId ?? null,
      providerCode: PROVIDER_CODE,
      operation: entry.operation,
      method: entry.method,
      endpoint: entry.endpoint,
      requestBody: entry.requestBody ? (redact(entry.requestBody) as never) : null,
      responseBody: entry.responseBody ? (redact(entry.responseBody) as never) : null,
      httpStatus: entry.httpStatus,
      ok: entry.ok,
      errorMessage: entry.errorMessage ?? null,
      durationMs: entry.durationMs,
    });
  } catch (e) {
    logger.error("No se pudo registrar la llamada a SixoFire", {
      operation: entry.operation,
      error: (e as Error).message,
    });
  }
}

/**
 * Ejecuta una petición y devuelve `data` ya desenvuelto.
 *
 * Lanza `ProviderRequestError` clasificado por `kind`, que es lo que
 * `orders.ts` usa para decidir si una compra fallida se reembolsa o se queda
 * pendiente. La distinción que importa: un 402 de saldo insuficiente es un NO
 * rotundo y se puede reembolsar; un timeout NO lo es, porque el pedido pudo
 * haberse creado igual del otro lado.
 */
export async function request<T>(opts: RequestOptions): Promise<T> {
  const c = config();
  if (!c.apiKey) {
    throw new ProviderRequestError(
      "BUSINESS",
      "SIXOFF_API_KEY no está configurada",
      null,
      "NOT_CONFIGURED",
    );
  }

  const url = `${c.baseUrl}${opts.path}`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? c.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  let httpStatus: number | null = null;
  let rawText = "";

  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": c.apiKey,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
      ...opcionesDeSalida(),
    });

    httpStatus = res.status;
    rawText = await res.text();

    let sobre: Sobre<T> | null = null;
    try {
      sobre = rawText ? (JSON.parse(rawText) as Sobre<T>) : null;
    } catch {
      sobre = null;
    }

    const durationMs = Date.now() - startedAt;

    /*
      Sin JSON no se puede afirmar nada, y por eso es MALFORMED y no HTTP: su
      infraestructura devuelve páginas de error en texto plano cuando se cae
      por detrás —comprobado el 3/11/2026, un 502 con el cuerpo "error code:
      502"—. Tratar eso como "la compra falló" sería reembolsar a ciegas algo
      que quizá sí se creó.
    */
    if (!sobre || typeof sobre.status !== "boolean") {
      await log({
        ...opts,
        endpoint: url,
        responseBody: { rawSnippet: rawText.slice(0, 500) },
        httpStatus,
        ok: false,
        errorMessage: "Respuesta no interpretable",
        durationMs,
      });
      throw new ProviderRequestError(
        "MALFORMED",
        "Respuesta de SixoFire no interpretable",
        httpStatus,
      );
    }

    // Un 200 no basta: se exige status === true, igual que con los demás.
    if (!res.ok || sobre.status !== true) {
      await log({
        ...opts,
        endpoint: url,
        requestBody: opts.body,
        responseBody: sobre,
        httpStatus,
        ok: false,
        errorMessage: sobre.message ?? sobre.error ?? `HTTP ${res.status}`,
        durationMs,
      });
      throw new ProviderRequestError(
        res.ok ? "BUSINESS" : "HTTP",
        sobre.message ?? sobre.error ?? `SixoFire respondió HTTP ${res.status}`,
        httpStatus,
        sobre.error ?? null,
        sobre,
      );
    }

    await log({
      ...opts,
      endpoint: url,
      requestBody: opts.body,
      responseBody: sobre,
      httpStatus,
      ok: true,
      durationMs,
    });

    if (sobre.data === undefined) {
      throw new ProviderRequestError("MALFORMED", "SixoFire devolvió status sin data", httpStatus);
    }
    return sobre.data;
  } catch (e) {
    if (e instanceof ProviderRequestError) throw e;

    const durationMs = Date.now() - startedAt;
    const aborted = (e as Error).name === "AbortError";
    const kind = aborted ? "TIMEOUT" : "NETWORK";
    const message = aborted
      ? `Tiempo de espera agotado (${timeoutMs} ms)`
      : `Error de red: ${(e as Error).message}`;

    await log({ ...opts, endpoint: url, httpStatus, ok: false, errorMessage: message, durationMs });
    logger.warn("Fallo de comunicación con SixoFire", { operation: opts.operation, kind, message });

    throw new ProviderRequestError(kind, message, httpStatus);
  } finally {
    clearTimeout(timer);
  }
}
