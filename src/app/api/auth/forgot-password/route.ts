import { assertSameOrigin, clientIp, ok, parseJson, route } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/server/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paso 1 de "¿Olvidaste tu contraseña?": pide el código por correo.
 *
 * No requiere sesión, así que el límite es solo por IP y por correo (no hay
 * usuario autenticado del que colgarse). Siempre responde éxito, exista o no
 * la cuenta: ver `requestPasswordReset` para el porqué.
 */
export const POST = route("auth.forgot-password", async (req) => {
  assertSameOrigin(req);
  const input = await parseJson(req, forgotPasswordSchema);

  await consume(RULES.passwordResetRequest, clientIp(req));
  await consume(RULES.passwordResetRequest, `email:${input.email}`);

  await requestPasswordReset(input.email);

  return ok({ sent: true });
});
