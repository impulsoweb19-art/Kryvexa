import { assertSameOrigin, clientIp, ok, parseJson, route } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { resetPassword } from "@/server/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paso 2: confirma el código de 6 dígitos y fija la contraseña nueva. */
export const POST = route("auth.reset-password", async (req) => {
  assertSameOrigin(req);
  const input = await parseJson(req, resetPasswordSchema);

  await consume(RULES.passwordResetConfirm, clientIp(req));
  await consume(RULES.passwordResetConfirm, `email:${input.email}`);

  await resetPassword(input.email, input.code, input.newPassword);

  return ok({ reset: true });
});
