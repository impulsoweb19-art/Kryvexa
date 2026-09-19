import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { redeemCodeSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { redeemCode } from "@/server/services/redemptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canje de un código promocional. Deja el premio esperando entrega manual. */
export const POST = route("redemption.redeem", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await consume(RULES.redeemCode, `user:${user.id}`);

  const input = await parseJson(req, redeemCodeSchema);
  const { code, orderCode } = await redeemCode(user, input.code, input.playerId);

  return ok({ prize: code.prize, orderCode }, 201);
});
