import "server-only";

import { createHash, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { verificationCodes, type VerificationPurpose } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { sendVerificationCodeEmail } from "@/lib/email";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Código de 6 dígitos, con ceros a la izquierda si hace falta: "004821". */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Genera un código, lo guarda (hasheado) y lo envía por correo.
 *
 * No invalida códigos anteriores sin consumir: si el usuario pide dos
 * seguidos, cualquiera de los dos vigentes sirve. `consumeVerificationCode`
 * solo mira el más reciente, así que en la práctica solo el último importa.
 */
export async function requestVerificationCode(
  userId: string,
  email: string,
  purpose: VerificationPurpose,
): Promise<void> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

  await db.insert(verificationCodes).values({
    userId,
    purpose,
    codeHash: hashCode(code),
    expiresAt,
  });

  await sendVerificationCodeEmail(email, code);
}

/**
 * Verifica el código más reciente y no vencido para (userId, purpose) y lo
 * marca como consumido. Lanza VALIDATION_ERROR con el campo `verificationCode`
 * si no hay código vigente, si ya se agotaron los intentos o si no coincide.
 */
export async function consumeVerificationCode(
  userId: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<void> {
  const invalidError = () =>
    new AppError("VALIDATION_ERROR", {
      userMessage: "El código de verificación no es válido o expiró.",
      details: { fields: { verificationCode: "Código inválido o expirado." } },
    });

  const [pending] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, userId),
        eq(verificationCodes.purpose, purpose),
        isNull(verificationCodes.consumedAt),
        gt(verificationCodes.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!pending) throw invalidError();

  if (pending.attempts >= MAX_ATTEMPTS) {
    throw new AppError("VALIDATION_ERROR", {
      userMessage: "Demasiados intentos con ese código. Solicita uno nuevo.",
      details: { fields: { verificationCode: "Demasiados intentos." } },
    });
  }

  if (hashCode(code) !== pending.codeHash) {
    await db
      .update(verificationCodes)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(verificationCodes.id, pending.id));
    throw new AppError("VALIDATION_ERROR", {
      userMessage: "El código ingresado no es correcto.",
      details: { fields: { verificationCode: "Código incorrecto." } },
    });
  }

  await db.update(verificationCodes).set({ consumedAt: new Date() }).where(eq(verificationCodes.id, pending.id));
}
