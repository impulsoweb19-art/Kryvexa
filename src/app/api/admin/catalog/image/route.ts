import { assertSameOrigin, ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { storeProductImage } from "@/server/services/storage";
import { setProductImage, clearProductImage } from "@/server/services/catalog";
import { recordAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sube (o reemplaza) la imagen de un paquete del catálogo.
 *
 * Llega como multipart porque es un archivo, igual que el QR de Yape. Se
 * valida por los BYTES REALES en `storeProductImage`, no por la extensión.
 */
export const POST = route("admin.catalog.image.upload", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();

  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION_ERROR", { userMessage: "Solicitud mal formada." });

  const productId = form.get("productId");
  if (typeof productId !== "string" || !productId) {
    throw new AppError("VALIDATION_ERROR", { userMessage: "Falta el producto." });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    throw new AppError("UPLOAD_INVALID", { userMessage: "Elige la imagen del paquete." });
  }

  const stored = await storeProductImage(file);
  await setProductImage(productId, stored.relativePath);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "product.image.upload",
    entityType: "product",
    entityId: productId,
    meta: { mime: stored.mime, size: stored.size },
  });

  return ok({ productId, hasImage: true });
});

/** Quita la imagen de un paquete: vuelve a la portada genérica del juego. */
export const DELETE = route("admin.catalog.image.clear", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();

  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) throw new AppError("VALIDATION_ERROR", { userMessage: "Falta el producto." });

  await clearProductImage(productId);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "product.image.clear",
    entityType: "product",
    entityId: productId,
  });

  return ok({ productId, hasImage: false });
});
