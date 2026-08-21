import { assertSameOrigin, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getConfig, setConfig } from "@/server/services/settings";
import { storeQr } from "@/server/services/storage";
import { recordAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sube (o reemplaza) el QR de Yape que ven los usuarios al recargar saldo.
 *
 * Llega como multipart porque es un archivo. Se valida por los BYTES REALES
 * en `storeQr`, no por la extensión ni por el Content-Type del navegador.
 */
export const POST = route("admin.settings.qr.upload", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();

  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION_ERROR", { userMessage: "Solicitud mal formada." });

  const file = form.get("qr");
  if (!(file instanceof File)) {
    throw new AppError("UPLOAD_INVALID", { userMessage: "Elige la imagen del QR." });
  }

  const stored = await storeQr(file);
  await setConfig({ yapeQrPath: stored.relativePath });

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "settings.qr.upload",
    entityType: "settings",
    meta: { mime: stored.mime, size: stored.size },
  });

  const config = await getConfig();
  return ok({ hasCustomQr: Boolean(config.yapeQrPath) });
});

/**
 * Vuelve al QR que viene incluido en el proyecto.
 *
 * El archivo subido no se borra del almacenamiento a propósito: si el
 * administrador se equivocó al restaurar, no perdemos nada, y son unos pocos
 * kilobytes. Lo que manda es la configuración, no lo que quede en el disco.
 */
export const DELETE = route("admin.settings.qr.reset", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();

  await setConfig({ yapeQrPath: null });
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "settings.qr.reset",
    entityType: "settings",
  });

  return ok({ hasCustomQr: false });
});
