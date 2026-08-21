import { z } from "zod";
import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { adminResolveOrder } from "@/server/services/orders";
import { cleanString } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  resolution: z.enum(["COMPLETED", "REFUNDED"]),
  note: cleanString(300).optional(),
});

/**
 * Resolución manual de una orden atascada (NEEDS_REVIEW).
 * Es la única forma de cerrar una orden cuyo resultado el proveedor nunca
 * confirmó: la decide una persona y queda auditada.
 */
export const POST = route("admin.orders.resolve", async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);

  const order = await adminResolveOrder(admin, id, body.resolution, body.note);
  return ok({ id: order.id, status: order.status });
});
