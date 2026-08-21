import "server-only";

/**
 * Logger estructurado mínimo (JSON a stdout, listo para Docker/journald).
 * Redacta cualquier clave sensible antes de imprimir: la API key jamás
 * debe aparecer en un log, ni siquiera por accidente.
 */

const SENSITIVE = [
  "authorization",
  "api_key",
  "apikey",
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "tokenhash",
  "token_hash",
  "secret",
  "cookie",
  "set-cookie",
  "session_secret",
];

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE.includes(k.toLowerCase()) ? "[REDACTADO]" : redact(v, depth + 1);
  }
  return out as unknown as T;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") emit("debug", m, meta);
  },
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
