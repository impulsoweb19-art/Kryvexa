import "server-only";

import { db } from "@/db";
import { providerTransactions } from "@/db/schema";
import { env } from "@/lib/env";
import { logger, redact } from "@/lib/logger";
import { ProviderRequestError } from "../types";

/**
 * Cliente HTTP de EpinBy.
 *
 * Igual que RecargasAmérica: la API key solo se lee aquí, este archivo empieza
 * con `import "server-only"`, y nada se registra en logs sin pasar por `redact`.
 *
 * Autenticación: header `X-API-KEY` (no OAuth, no credenciales de jugador).
 * Documentación: https://epinby.com/docs
 */

export const PROVIDER_CODE = "epinby";

/**
 * Envoltorio estándar de la API: { success, data } | { success:false, error }.
 * Los endpoints paginados (como /products) agregan `meta` junto a `data`,
 * no adentro — por eso viaja como campo del sobre, no de `T`.
 */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  meta?: { total: number; per_page: number; current_page: number; last_page: number };
}

interface RequestOptions {
  operation: string; // etiqueta para la bitácora: "order.create"
  method: "GET" | "POST";
  path: string; // "/order"
  body?: Record<string, unknown>;
  orderId?: string;
  /** Solo POST /order lo requiere (ver docs de idempotencia). */
  idempotencyKey?: string;
  timeoutMs?: number;
}

function config() {
  const e = env();
  return {
    baseUrl: e.EPINBY_BASE_URL.replace(/\/+$/, ""),
    apiKey: e.EPINBY_API_KEY.trim(),
    webhookSecret: e.EPINBY_WEBHOOK_SECRET.trim(),
    timeoutMs: e.EPINBY_TIMEOUT_MS,
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

export function webhookSecret(): string {
  return config().webhookSecret;
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
    logger.error("No se pudo registrar la llamada a EpinBy", {
      operation: entry.operation,
      error: (e as Error).message,
    });
  }
}

/**
 * Ejecuta una petición y devuelve el SOBRE completo ({ success, data, meta,
 * ... }), sin desenvolver. Lo necesitan los endpoints paginados como
 * /products, donde `meta` (con `last_page`) viaja junto a `data`, no dentro.
 * Lanza `ProviderRequestError` en cualquier fallo, clasificado por `kind`.
 */
export async function requestEnvelope<T>(opts: RequestOptions): Promise<ApiEnvelope<T>> {
  const c = config();
  if (!c.apiKey && !c.mock) {
    throw new ProviderRequestError("BUSINESS", "EPINBY_API_KEY no está configurada", null, "NOT_CONFIGURED");
  }

  const url = `${c.baseUrl}${opts.path}`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? c.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-KEY": c.apiKey,
  };
  if (opts.idempotencyKey) headers["X-Idempotency-Key"] = opts.idempotencyKey;

  let httpStatus: number | null = null;
  let parsed: ApiEnvelope<T> | null = null;
  let rawText = "";

  try {
    const res = await fetch(url, {
      method: opts.method,
      headers,
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
      throw new ProviderRequestError("MALFORMED", "Respuesta de EpinBy no interpretable", httpStatus);
    }

    // NUNCA se asume éxito por un HTTP 200: se exige success === true, igual que RecargasAmérica.
    if (!res.ok || parsed.success !== true) {
      await log({
        ...opts,
        endpoint: url,
        responseBody: parsed,
        httpStatus,
        ok: false,
        errorMessage: parsed.error?.message ?? `HTTP ${res.status}`,
        durationMs,
      });
      throw new ProviderRequestError(
        res.ok ? "BUSINESS" : "HTTP",
        parsed.error?.message ?? `EpinBy respondió HTTP ${res.status}`,
        httpStatus,
        parsed.error?.code ?? null,
        parsed,
      );
    }

    await log({ ...opts, endpoint: url, responseBody: parsed, httpStatus, ok: true, durationMs });

    if (parsed.data === undefined) {
      throw new ProviderRequestError("MALFORMED", "EpinBy devolvió success sin data", httpStatus);
    }
    return parsed;
  } catch (e) {
    if (e instanceof ProviderRequestError) throw e;

    const durationMs = Date.now() - startedAt;
    const aborted = (e as Error).name === "AbortError";
    const kind = aborted ? "TIMEOUT" : "NETWORK";
    const message = aborted
      ? `Tiempo de espera agotado (${timeoutMs} ms)`
      : `Error de red: ${(e as Error).message}`;

    await log({ ...opts, endpoint: url, httpStatus, ok: false, errorMessage: message, durationMs });
    logger.warn("Fallo de comunicación con EpinBy", { operation: opts.operation, kind, message });

    throw new ProviderRequestError(kind, message, httpStatus);
  } finally {
    clearTimeout(timer);
  }
}

/** Ejecuta una petición y devuelve solo `data`, ya desenvuelto. */
export async function request<T>(opts: RequestOptions): Promise<T> {
  const envelope = await requestEnvelope<T>(opts);
  return envelope.data as T;
}
