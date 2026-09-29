import { z } from "zod";

import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

const schema = z.object({ hidden: z.boolean() });

/**
 * Entrar o salir del ranking público de recargas.
 *
 * Va aparte de PATCH /api/auth/account a propósito: aquel exige la contraseña
 * actual porque toca el correo y el acceso. Esto es una preferencia de
 * visualización, y pedir la contraseña para un interruptor hace que la gente
 * no lo use —y entonces el derecho a salirse existe solo sobre el papel—.
 */
export const POST = route("account.ranking", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const { hidden } = await parseJson(req, schema);

  await db
    .update(users)
    .set({ hideFromRanking: hidden, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Sin esto el cambio tardaría hasta cinco minutos en verse, y quien acaba de
  // pedir salir del ranking querría verse fuera YA.
  revalidateTag("ranking");

  return ok({ hidden });
});
