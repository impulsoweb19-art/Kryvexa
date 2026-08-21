import { z } from "zod";
import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { setUserStatus } from "@/server/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

export const PATCH = route("admin.users.status", async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { status } = await parseJson(req, bodySchema);

  const user = await setUserStatus(admin, id, status);
  return ok({ id: user.id, status: user.status });
});
