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

/**
 * Además de los nombres exactos de arriba, cualquier clave que TERMINE en
 * "secret" se tapa igual.
 *
 * La lista exacta se quedó corta el 14/11/2026: SixoFire devuelve el secreto
 * de firma de sus webhooks en un campo llamado `signingSecret`, y como no
 * estaba escrito tal cual, se guardó en claro en `provider_transactions`.
 * Nombrar secretos uno a uno es una carrera que se pierde: basta con que el
 * siguiente proveedor lo llame `webhookSecret` o `clientSecret`.
 */
function esSensible(clave: string): boolean {
  const k = clave.toLowerCase();
  return SENSITIVE.includes(k) || k.endsWith("secret");
}

export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = esSensible(k) ? "[REDACTADO]" : redact(v, depth + 1);
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
