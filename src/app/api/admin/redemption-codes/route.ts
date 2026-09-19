import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { generateCodesSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/session";
import { generateCodes } from "@/server/services/redemptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Genera un lote de códigos con el mismo premio. */
export const POST = route("admin.redemption.generate", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const input = await parseJson(req, generateCodesSchema);

  const codes = await generateCodes(admin, input);

  return ok({ codes: codes.map((c) => c.code), prize: input.prize }, 201);
});
