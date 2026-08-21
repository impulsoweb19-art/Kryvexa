import "server-only";

import { inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { settings } from "@/db/schema";

/**
 * Configuración editable desde el panel. Guardada como pares clave/JSON para
 * poder añadir opciones sin migrar la base de datos.
 *
 * IMPORTANTE: aquí NO van secretos. La API key vive en el entorno del servidor,
 * nunca en la base de datos ni en una pantalla de administración.
 */
export interface StoreConfig {
  storeName: string;
  yapeHolderName: string;
  yapePhone: string;
  yapeInstructions: string;
  /**
   * QR de Yape que se muestra en la pantalla de recarga.
   *
   * `null` → se usa la imagen incluida en el proyecto (`/yape-qr.png`).
   * Si tiene valor, es el archivo que subió el administrador: una ruta
   * relativa (driver "local") o una URL de Vercel Blob (driver "blob"). En
   * ese caso NO se expone tal cual: se sirve por `/api/yape-qr`.
   */
  yapeQrPath: string | null;
  supportWhatsapp: string;
  supportEmail: string;
  /** Canal de difusión de WhatsApp (el botón grande del pie). Vacío = no se muestra. */
  socialWhatsappChannel: string;
  /** Perfil de TikTok. Vacío = no se muestra. */
  socialTiktok: string;
  /** Perfil de Instagram. Vacío = no se muestra. */
  socialInstagram: string;
  /** Soles por dólar. */
  exchangeRate: number;
  /** Margen global en basis points (2500 = 25 %). */
  marginBps: number;
  minDepositCents: number;
  /** Interruptor de emergencia: corta las compras sin apagar el sitio. */
  purchasesEnabled: boolean;
  /** Avisar en el panel si el saldo del revendedor baja de aquí (USD, céntimos). */
  providerLowBalanceUsdCents: number;
}

export const DEFAULT_CONFIG: StoreConfig = {
  storeName: "KRYVEXA",
  yapeHolderName: "",
  yapePhone: "",
  yapeInstructions:
    "Yapea el monto exacto al número indicado y sube la captura del comprobante. La acreditación es manual y suele tardar pocos minutos en horario de atención.",
  yapeQrPath: null,
  supportWhatsapp: "",
  supportEmail: "",
  socialWhatsappChannel: "",
  socialTiktok: "",
  socialInstagram: "",
  exchangeRate: 3.8,
  marginBps: 2500,
  minDepositCents: 500,
  purchasesEnabled: true,
  providerLowBalanceUsdCents: 2000,
};

const KEYS = Object.keys(DEFAULT_CONFIG) as (keyof StoreConfig)[];

/**
 * Normaliza un valor leído de JSONB al tipo que declara DEFAULT_CONFIG.
 *
 * No es paranoia: el driver puede devolver un escalar JSON reinterpretado. Un
 * número de WhatsApp guardado como "51999999999" vuelve como NÚMERO, y entonces
 * `config.supportWhatsapp.replace(...)` revienta la página. Anclamos el tipo al
 * valor por defecto en lugar de confiar en lo que llegue.
 */
function coerce(key: keyof StoreConfig, raw: unknown): unknown {
  const fallback = DEFAULT_CONFIG[key];

  // yapeQrPath admite null explícitamente.
  if (fallback === null) return raw == null ? null : String(raw);

  switch (typeof fallback) {
    case "string":
      return raw == null ? "" : String(raw);
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : fallback;
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : raw === "true";
    default:
      return raw;
  }
}

export async function getConfig(tx: DbOrTx = db): Promise<StoreConfig> {
  const rows = await tx
    .select()
    .from(settings)
    .where(inArray(settings.key, KEYS as string[]));

  const out = { ...DEFAULT_CONFIG };
  for (const row of rows) {
    const key = row.key as keyof StoreConfig;
    if (key in out) {
      (out as Record<string, unknown>)[key] = coerce(key, row.valueJson);
    }
  }
  return out;
}

export async function setConfig(patch: Partial<StoreConfig>, tx: DbOrTx = db): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => KEYS.includes(k as keyof StoreConfig));
  if (!entries.length) return;

  for (const [key, value] of entries) {
    // Se serializa a JSONB explícitamente: pasar `null` directamente haría que
    // el driver enviara un NULL de SQL y chocara con la restricción NOT NULL.
    const json = sql`${JSON.stringify(value ?? null)}::jsonb`;
    await tx
      .insert(settings)
      .values({ key, valueJson: json })
      .onConflictDoUpdate({
        target: settings.key,
        set: { valueJson: json, updatedAt: new Date() },
      });
  }
}

/** QR incluido en el proyecto (public/yape-qr.png). Es el que se usa si el administrador no subió otro. */
export const BUNDLED_YAPE_QR = "/yape-qr.png";

/**
 * De dónde sale la imagen del QR para la pantalla de recarga.
 *
 * Si el administrador subió una, se sirve por la ruta autenticada
 * `/api/yape-qr`; si no, se usa la que viene incluida en el proyecto.
 */
export function yapeQrSrc(c: StoreConfig): string {
  return c.yapeQrPath ? "/api/yape-qr" : BUNDLED_YAPE_QR;
}

/**
 * Config segura para enviar al navegador: solo lo que el usuario debe ver.
 * El tipo de cambio y el margen NO salen de aquí (son información comercial).
 */
export function publicConfig(c: StoreConfig) {
  return {
    storeName: c.storeName,
    yapeHolderName: c.yapeHolderName,
    yapePhone: c.yapePhone,
    yapeInstructions: c.yapeInstructions,
    supportWhatsapp: c.supportWhatsapp,
    supportEmail: c.supportEmail,
    socialWhatsappChannel: c.socialWhatsappChannel,
    socialTiktok: c.socialTiktok,
    socialInstagram: c.socialInstagram,
    minDepositCents: c.minDepositCents,
    purchasesEnabled: c.purchasesEnabled,
  };
}

export type PublicConfig = ReturnType<typeof publicConfig>;
