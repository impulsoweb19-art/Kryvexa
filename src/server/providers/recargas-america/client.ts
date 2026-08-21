import "server-only";

import { db } from "@/db";
import { providerTransactions } from "@/db/schema";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";

/**
 * Cliente HTTP de RecargasAmérica.
 *
 * ── DÓNDE VIVE LA API KEY ───────────────────────────────────────────────────
 * Solo aquí, leída de `RECARGAS_AMERICA_API_KEY`. Este archivo empieza con
 * `import "server-only"`, así que si alguien intentara importarlo desde un
 * componente de cliente el BUILD FALLA. No es una convención: es una barrera
 * del compilador. La key no se registra en logs (el redactor la borra), no se
 * guarda en base de datos y nunca se envía al navegador.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const PROVIDER_CODE = "recargas_america";

/** Distingue "no se pudo preguntar" de "el proveedor dijo que no". */
export type FailureKind =
  | "NETWORK" // no hubo respuesta → resultado DESCONOCIDO
  | "TIMEOUT" // no hubo respuesta a tiempo → resultado DESCONOCIDO
  | "HTTP" // el proveedor respondió con error → resultado conocido
  | "BUSINESS" // 200 con success:false → resultado conocido
  | "MALFORMED"; // respuesta ilegible → resultado DESCONOCIDO

export class ProviderRequestError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly httpStatus: number | null = null,
    readonly providerCode: string | null = null,
    readonly raw: unknown = null,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }

  /**
   * true si NO podemos afirmar que la operación no ocurrió.
   * En una compra, esto obliga a dejar la orden en PENDING en lugar de
   * reembolsar a ciegas (podría haberse ejecutado del otro lado).
   */
  get resultUnknown(): boolean {
    return this.kind === "NETWORK" || this.kind === "TIMEOUT" || this.kind === "MALFORMED";
  }
}

/** Envoltorio estándar de la API: { success, data } | { success:false, error, code } */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface RequestOptions {
  operation: string; // etiqueta para la bitácora: "buy.games"
  method: "GET" | "POST";
  path: string; // "/buy/games"
  body?: Record<string, unknown>;
  orderId?: string;
  /** Timeout específico; por defecto el de la variable de entorno. */
  timeoutMs?: number;
}

function config() {
  const e = env();
  return {
    baseUrl: e.RECARGAS_AMERICA_BASE_URL.replace(/\/+$/, ""),
    apiKey: e.RECARGAS_AMERICA_API_KEY.trim(),
    timeoutMs: e.RECARGAS_AMERICA_TIMEOUT_MS,
    mock: e.PROVIDER_MOCK,
  };
}

export function isConfigured(): boolean {
  const c = config();
  return c.mock || c.apiKey.length > 0;
}

export function isMock(): boolean {
  return config().mock;
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
    logger.error("No se pudo registrar la llamada al proveedor", {
      operation: entry.operation,
      error: (e as Error).message,
    });
  }
}

/**
 * Ejecuta una petición y devuelve `data` ya desenvuelto.
 * Lanza `ProviderRequestError` en cualquier fallo, clasificado por `kind`.
 */
export async function request<T>(opts: RequestOptions): Promise<T> {
  const c = config();
  if (!c.apiKey && !c.mock) {
    throw new ProviderRequestError(
      "BUSINESS",
      "RECARGAS_AMERICA_API_KEY no está configurada",
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
  let parsed: ApiEnvelope<T> | null = null;
  let rawText = "";

  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.apiKey}`,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    httpStatus = res.status;
    rawText = await res.text();

    try {
      parsed = rawText ? (JSON.parse(rawText) as ApiEnvelope<T>) : null;
    } catch {
      parsed = null;
    }

    const durationMs = Date.now() - startedAt;

    if (!parsed || typeof parsed.success !== "boolean") {
      await log({
        ...opts,
        endpoint: url,
        responseBody: { rawSnippet: rawText.slice(0, 500) },
        httpStatus,
        ok: false,
        errorMessage: "Respuesta no interpretable",
        durationMs,
      });
      throw new ProviderRequestError("MALFORMED", "Respuesta del proveedor no interpretable", httpStatus);
    }

    // NUNCA se asume éxito por un HTTP 200: se exige success === true.
    if (!res.ok || parsed.success !== true) {
      await log({
        ...opts,
        endpoint: url,
        responseBody: parsed,
        httpStatus,
        ok: false,
        errorMessage: parsed.error ?? `HTTP ${res.status}`,
        durationMs,
      });
      throw new ProviderRequestError(
        res.ok ? "BUSINESS" : "HTTP",
        parsed.error ?? `El proveedor respondió HTTP ${res.status}`,
        httpStatus,
        parsed.code ?? null,
        parsed,
      );
    }

    await log({ ...opts, endpoint: url, responseBody: parsed, httpStatus, ok: true, durationMs });

    if (parsed.data === undefined) {
      throw new ProviderRequestError("MALFORMED", "El proveedor devolvió success sin data", httpStatus);
    }
    return parsed.data;
  } catch (e) {
    if (e instanceof ProviderRequestError) throw e;

    const durationMs = Date.now() - startedAt;
    const aborted = (e as Error).name === "AbortError";
    const kind: FailureKind = aborted ? "TIMEOUT" : "NETWORK";
    const message = aborted
      ? `Tiempo de espera agotado (${timeoutMs} ms)`
      : `Error de red: ${(e as Error).message}`;

    await log({
      ...opts,
      endpoint: url,
      httpStatus,
      ok: false,
      errorMessage: message,
      durationMs,
    });
    logger.warn("Fallo de comunicación con el proveedor", { operation: opts.operation, kind, message });

    throw new ProviderRequestError(kind, message, httpStatus);
  } finally {
    clearTimeout(timer);
  }
}
