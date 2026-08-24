import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, wallets } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword, fakeVerify, verifyPassword } from "@/lib/password";
import { createSession, revokeAllSessions, type SessionUser } from "@/lib/session";
import { ensureWallet } from "./wallet";
import { recordAudit } from "./audit";
import { logger } from "@/lib/logger";
import { requestVerificationCode, consumeVerificationCode } from "./verification";

export interface RegisterServiceInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export async function registerUser(input: RegisterServiceInput): Promise<SessionUser> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (existing) {
    // Mensaje neutro: no confirmamos ni negamos que el correo esté registrado.
    throw new AppError("VALIDATION_ERROR", {
      userMessage: "No pudimos crear la cuenta con esos datos. Si ya tienes cuenta, inicia sesión.",
      internalMessage: `Intento de registro duplicado: ${email}`,
    });
  }

  const passwordHash = await hashPassword(input.password);

  const user = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email,
        name: input.name,
        phone: input.phone ?? null,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      })
      .returning();

    // La billetera nace con el usuario: nunca hay una cuenta sin billetera.
    await tx.insert(wallets).values({ userId: created.id });
    return created;
  });

  await createSession(user.id);
  await recordAudit({ actorId: user.id, action: "user.register", entityType: "user", entityId: user.id });

  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
}

export async function loginUser(email: string, password: string): Promise<SessionUser> {
  const normalized = email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  if (!user) {
    // Se gasta el mismo tiempo que en un login real para no revelar por
    // temporización si la cuenta existe.
    await fakeVerify(password);
    throw new AppError("UNAUTHENTICATED", { userMessage: "Correo o contraseña incorrectos." });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    logger.warn("Contraseña incorrecta", { userId: user.id });
    throw new AppError("UNAUTHENTICATED", { userMessage: "Correo o contraseña incorrectos." });
  }

  if (user.status !== "ACTIVE") {
    throw new AppError("ACCOUNT_SUSPENDED");
  }

  await ensureWallet(user.id);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);

  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
}

/**
 * Cambio de datos de la propia cuenta (nombre, correo y/o contraseña).
 *
 * Reglas de seguridad, todas deliberadas:
 *  · Se exige la contraseña ACTUAL siempre, incluso para cambiar solo el
 *    nombre. Si alguien deja la sesión abierta en un cibercafé, no puede
 *    quedarse con la cuenta cambiando el correo.
 *  · Al cambiar la contraseña se cierran TODAS las demás sesiones y se abre
 *    una nueva para quien hizo el cambio. Así, si alguien te había robado la
 *    sesión, cambiar la contraseña lo echa de verdad.
 *  · El correo se guarda en minúsculas y se comprueba que no lo tenga otra
 *    cuenta. El índice único de la base lo garantiza igual, pero conviene dar
 *    un mensaje claro antes de que reviente.
 *
 * (No pide código de verificación por correo: `currentPassword` ya demuestra
 * que quien cambia los datos es dueño de la sesión. Ese código sí se exige
 * en `resetPassword`, más abajo, que es para cuando NO se tiene sesión ni
 * contraseña.)
 */
export async function updateOwnAccount(
  userId: string,
  input: { currentPassword: string; name?: string; email?: string; newPassword?: string },
): Promise<SessionUser> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("UNAUTHENTICATED");

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    logger.warn("Contraseña actual incorrecta al editar la cuenta", { userId });
    throw new AppError("VALIDATION_ERROR", {
      userMessage: "Tu contraseña actual no es correcta.",
      details: { fields: { currentPassword: "Contraseña incorrecta." } },
    });
  }

  const patch: Partial<typeof users.$inferInsert> = {};

  if (input.name && input.name !== user.name) patch.name = input.name;

  const nextEmail = input.email?.toLowerCase().trim();
  if (nextEmail && nextEmail !== user.email.toLowerCase()) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${nextEmail}`)
      .limit(1);
    if (taken && taken.id !== userId) {
      throw new AppError("VALIDATION_ERROR", {
        userMessage: "Ese correo ya está en uso por otra cuenta.",
        details: { fields: { email: "Ese correo ya está en uso." } },
      });
    }
    patch.email = nextEmail;
  }

  const changingPassword = Boolean(input.newPassword);
  if (input.newPassword) patch.passwordHash = await hashPassword(input.newPassword);

  if (!Object.keys(patch).length) {
    // Nada que hacer: se devuelve el estado actual en vez de fingir un cambio.
    return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status };
  }

  patch.updatedAt = new Date();
  const [updated] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();

  if (changingPassword) {
    await revokeAllSessions(userId);
    await createSession(userId);
  }

  await recordAudit({
    actorId: userId,
    actorEmail: updated.email,
    action: "user.account.update",
    entityType: "user",
    entityId: userId,
    // Se registra QUÉ cambió, nunca los valores de la contraseña.
    meta: {
      nombre: Boolean(patch.name),
      correo: Boolean(patch.email),
      contrasena: changingPassword,
    },
  });

  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    status: updated.status,
  };
}

/**
 * Paso 1 de "¿Olvidaste tu contraseña?": envía el código si el correo existe.
 *
 * Responde igual (éxito, sin detalles) exista o no la cuenta: decir "ese
 * correo no está registrado" le regalaría a un atacante una forma de
 * comprobar qué correos tienen cuenta en la tienda.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  if (!user) return; // silencioso a propósito, ver arriba

  await requestVerificationCode(user.id, user.email, "PASSWORD_RESET");
}

/**
 * Paso 2: confirma el código y fija la contraseña nueva.
 *
 * Cierra todas las sesiones existentes (igual que un cambio de contraseña
 * normal) pero NO abre una nueva: quien recupera la cuenta no tiene sesión
 * previa que "conservar", así que entra por el login de siempre.
 */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const invalidCodeError = () =>
    new AppError("VALIDATION_ERROR", {
      userMessage: "El código de verificación no es válido o expiró.",
      details: { fields: { code: "Código inválido o expirado." } },
    });

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);

  // Mismo mensaje que un código incorrecto: no se revela si el correo existe.
  if (!user) throw invalidCodeError();

  await consumeVerificationCode(user.id, "PASSWORD_RESET", code);

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await revokeAllSessions(user.id);

  await recordAudit({
    actorId: user.id,
    action: "user.password.reset",
    entityType: "user",
    entityId: user.id,
  });
}

export async function setUserStatus(admin: SessionUser, userId: string, status: "ACTIVE" | "SUSPENDED") {
  if (admin.id === userId && status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", { userMessage: "No puedes suspender tu propia cuenta." });
  }

  const [updated] = await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new AppError("NOT_FOUND");

  // Suspender debe cortar el acceso YA, no cuando expire la cookie.
  if (status === "SUSPENDED") await revokeAllSessions(userId);

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: status === "SUSPENDED" ? "user.suspend" : "user.activate",
    entityType: "user",
    entityId: userId,
  });

  return updated;
}
