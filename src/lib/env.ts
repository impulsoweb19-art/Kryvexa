import "server-only";

/**
 * Validación de variables de entorno del SERVIDOR.
 *
 * `import "server-only"` hace que el BUILD FALLE si algún Client Component
 * importa este módulo (directa o transitivamente). Es una barrera de
 * compilación, no una convención: la API key no puede filtrarse al navegador
 * por accidente.
 */
import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET debe tener al menos 32 caracteres"),

  RECARGAS_AMERICA_BASE_URL: z.string().url().default("https://panel.recargasamerica.com/api/v1"),
  RECARGAS_AMERICA_API_KEY: z.string().default(""),
  RECARGAS_AMERICA_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PROVIDER_MOCK: bool,

  CRON_SECRET: z.string().min(16, "CRON_SECRET debe tener al menos 16 caracteres"),

  RECEIPTS_DIR: z.string().default("./storage/receipts"),
  MAX_RECEIPT_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  /**
   * Dónde se guardan los comprobantes de Yape.
   *   "local" → disco del servidor (sirve para la demo y para Docker/VPS,
   *             donde `RECEIPTS_DIR` es un volumen persistente).
   *   "blob"  → Vercel Blob. Obligatorio en Vercel: ahí el disco NO persiste
   *             entre despliegues ni entre invocaciones de la función.
   */
  STORAGE_DRIVER: z.enum(["local", "blob"]).default("local"),
  /** Token que Vercel inyecta solo cuando activas Blob Storage en el proyecto. */
  BLOB_READ_WRITE_TOKEN: z.string().default(""),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  · ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${detail}\n\nRevisa tu archivo .env (usa .env.example como guía).`);
  }
  if (parsed.data.STORAGE_DRIVER === "blob" && !parsed.data.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "STORAGE_DRIVER=blob requiere BLOB_READ_WRITE_TOKEN (lo crea Vercel al activar Blob Storage en el proyecto).",
    );
  }
  return parsed.data;
}

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = load();
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
