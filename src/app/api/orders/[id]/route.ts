import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getOrderForViewer } from "@/server/services/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Consulta puntual del estado de una orden (la usa el sondeo del checkout). */
export const GET = route("orders.get", async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const order = await getOrderForViewer(id, user);

  return ok({
    id: order.id,
    code: order.code,
    status: order.status,
    productName: order.productName,
    gameName: order.gameName,
    priceCents: order.priceCents,
    providerReference: order.providerReference,
    failureMessage: order.failureMessage,
    completedAt: order.completedAt,
    createdAt: order.createdAt,
  });
});
