import { assertSameOrigin, clientIp, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { consume, RULES } from "@/lib/rate-limit";
import { requestVerificationCode } from "@/server/services/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Envía por correo el código que confirma un cambio de contraseña desde "Mi
 * cuenta". Limitado por IP y por usuario: sin tope, esto sería una forma
 * barata de hacer spam de correo hacia cualquier cuenta.
 */
export const POST = route("auth.account.verification-code", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();

  await consume(RULES.accountVerificationRequest, `user:${user.id}`);
  await consume(RULES.accountVerificationRequest, clientIp(req));

  await requestVerificationCode(user.id, user.email, "ACCOUNT_UPDATE");

  return ok({ sent: true });
});
