import { z } from "zod";
import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { approveDeposit, rejectDeposit } from "@/server/services/deposits";
import { cleanString } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("reject"),
    reason: cleanString(300).pipe(z.string().min(3, "Indica el motivo del rechazo")),
  }),
]);

/** Aprobar o rechazar una solicitud de depósito. Solo administradores. */
export const POST = route("admin.deposits.review", async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);

  if (body.action === "approve") {
    const result = await approveDeposit(admin, id);
    return ok({
      status: result.deposit.status,
      balanceAfterCents: result.balanceAfterCents,
    });
  }

  const deposit = await rejectDeposit(admin, id, body.reason);
  return ok({ status: deposit.status });
});
