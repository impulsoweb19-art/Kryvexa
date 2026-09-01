import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { bulkSetVisibility, syncCatalog, updateProductOverride } from "@/server/services/catalog";
import { bulkVisibilitySchema, productOverrideSchema } from "@/lib/validation";
import { recordAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El catálogo de EpinBy trae ~2500 productos en ~25 páginas; aunque se piden
// en paralelo, sigue siendo más lento que una petición normal. Margen extra
// para que no se corte a medio sincronizar.
export const maxDuration = 60;

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

/** Mostrar/ocultar varios productos de una sola vez (botón "Seleccionar todos" del catálogo). */
export const PUT = route("admin.catalog.bulk-visibility", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const input = await parseJson(req, bulkVisibilitySchema);

  const updatedCount = await bulkSetVisibility(input.productIds, input.visible);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "product.bulk_visibility",
    entityType: "product",
    meta: { count: updatedCount, visible: input.visible },
  });

  return ok({ updatedCount });
});
