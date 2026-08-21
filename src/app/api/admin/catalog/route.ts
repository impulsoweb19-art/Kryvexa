import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { syncCatalog, updateProductOverride } from "@/server/services/catalog";
import { productOverrideSchema } from "@/lib/validation";
import { recordAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fuerza una sincronización del catálogo contra el proveedor. */
export const POST = route("admin.catalog.sync", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();

  const result = await syncCatalog();
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "catalog.sync",
    entityType: "catalog",
    meta: { ...result },
  });

  return ok(result);
});

/** Ajustes del administrador sobre un producto (precio fijo, visibilidad, orden). */
export const PATCH = route("admin.catalog.update", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const input = await parseJson(req, productOverrideSchema);

  const { productId, ...patch } = input;
  const product = await updateProductOverride(productId, patch);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "product.update",
    entityType: "product",
    entityId: productId,
    meta: patch,
  });

  return ok({ id: product.id, visible: product.visible, priceCents: product.priceCents });
});
