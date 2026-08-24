import { assertSameOrigin, clientIp, ok, parseJson, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { accountSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { updateOwnAccount } from "@/server/services/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Editar la propia cuenta: nombre, correo y contraseña.
 *
 * Sirve igual para un cliente y para el administrador: no hay una pantalla
 * distinta para cada rol porque la operación es la misma. El límite de
 * intentos existe porque este formulario pide la contraseña actual, y sin
 * límite se podría usar para adivinarla a fuerza bruta.
 */
export const PATCH = route("auth.account.update", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const input = await parseJson(req, accountSchema);

  await consume(RULES.accountUpdate, `user:${user.id}`);
  await consume(RULES.accountUpdate, clientIp(req));

  const updated = await updateOwnAccount(user.id, {
    currentPassword: input.currentPassword,
    name: input.name,
    email: input.email,
    newPassword: input.newPassword,
  });

  return ok({ user: updated, passwordChanged: Boolean(input.newPassword) });
});
