import { z } from "zod";
import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { setUserEmail, setUserStatus } from "@/server/services/auth";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suspender/reactivar una cuenta, o corregirle el correo.
 *
 * El correo va aquí y no en el formulario de la propia persona porque quien lo
 * tiene mal escrito no puede entrar a arreglarlo: necesitaría el código de
 * recuperación, que se le manda justamente al correo que no existe.
 */
const bodySchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
    email: z.string().trim().toLowerCase().email("Correo inválido").optional(),
  })
  .refine((d) => d.status !== undefined || d.email !== undefined, {
    message: "Nada que actualizar.",
  });

export const PATCH = route("admin.users.update", async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);

  if (body.email !== undefined) {
    const user = await setUserEmail(admin, id, body.email);
    return ok({ id: user.id, email: user.email });
  }

  if (!body.status) throw new AppError("VALIDATION_ERROR");
  const user = await setUserStatus(admin, id, body.status);
  return ok({ id: user.id, status: user.status });
});
