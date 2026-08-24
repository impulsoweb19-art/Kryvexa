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

  /**
   * Solo lo usan las rutas /api/cron/*. Se declara opcional a propósito: si
   * falta, lo correcto es que dejen de funcionar las tareas programadas, no
   * que se caiga la tienda entera. Quien exige que exista es cada ruta de
   * cron, justo antes de hacer algo (ver `assertCron`).
   *
   * SESSION_SECRET, en cambio, sí es obligatorio y no lleva valor por
   * defecto: sin él no se pueden firmar las sesiones, y "inventar" uno en
   * cada arranque expulsaría a los usuarios sin avisar.
   */
  CRON_SECRET: z.string().default(""),

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

  /**
   * Envío de correo (hoy: código para "¿Olvidaste tu contraseña?"). Igual
   * que CRON_SECRET: se declara opcional a propósito. Si falta, quien debe
   * fallar es el envío del código, con un mensaje claro, no la web entera.
   * Esa comprobación vive en `lib/email.ts`.
   */
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Kryvexa <no-reply@kryvexa.com>"),
});

/**
 * Quita las variables que llegan vacías, para que cuenten como ausentes.
 *
 * ¿Por qué hace falta? Porque los paneles de hosting crean variables sin
 * valor con demasiada facilidad: Vercel, al importar el proyecto, lee los
 * NOMBRES del archivo `.env.example` y da de alta las 16 en blanco. Una
 * cadena vacía no es lo mismo que "sin definir" para el validador: los
 * valores por defecto solo se aplican a lo ausente, así que seis variables
 * que tenían un valor por defecto perfectamente bueno hacían fallar el
 * arranque de toda la web.
 *
 * Tratando el vacío como ausencia, esos defaults entran en juego y solo
 * protestan las variables que de verdad no tienen alternativa razonable
 * (la base de datos y los secretos de sesión y de cron).
 */
function definedOnly(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim() !== "") out[key] = value;
  }
  return out;
}

function load() {
  const parsed = schema.safeParse(definedOnly(process.env));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  · ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variables de entorno inválidas:\n${detail}\n\nRevisa tu archivo .env (usa .env.example como guía).`);
  }
  /**
   * A propósito NO se valida aquí que `STORAGE_DRIVER=blob` traiga su token.
   *
   * Antes sí se hacía, y era un error de diseño: `env()` se llama en casi
   * cualquier petición, así que una mala configuración del almacén de
   * comprobantes dejaba TODA la web caída con error 500 — la portada, el
   * catálogo, el inicio de sesión. Un problema en una función concreta no
   * debe tumbar las demás.
   *
   * Esa comprobación vive ahora en `server/services/storage.ts`, justo donde
   * se va a escribir el archivo: si falta el token, falla la subida del
   * comprobante (con un mensaje que dice qué hacer) y el resto del sitio
   * sigue funcionando con normalidad.
   */
  return parsed.data;
}

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = load();
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
