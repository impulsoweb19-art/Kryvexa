import "server-only";

import { cookies, headers } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { env } from "./env";
import { secureToken } from "./ids";
import { AppError } from "./errors";

/**
 * Sesiones con token opaco + registro en BD.
 *
 * ¿Por qué no un JWT sin estado? Porque necesitamos poder REVOCAR al instante:
 * al suspender un usuario, al cerrar sesión y al cambiar la contraseña. Un JWT
 * firmado seguiría siendo válido hasta su expiración.
 *
 * En la cookie viaja el token en claro; en la base guardamos su HMAC-SHA256.
 * Si alguien copia la base de datos, no obtiene sesiones utilizables.
 */

export const SESSION_COOKIE = "ra_session";
const SESSION_TTL_DAYS = 7;

function hashToken(token: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
}

async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: (forwarded ? forwarded.split(",")[0] : h.get("x-real-ip"))?.trim().slice(0, 64) ?? null,
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = secureToken(32);
  const { ip, userAgent } = await requestMeta();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip,
    userAgent,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccesible desde JavaScript → mitiga XSS
    secure: env().NODE_ENV === "production",
    sameSite: "lax", // mitiga CSRF en peticiones cross-site
    path: "/",
    expires: expiresAt,
  });
}

/** Devuelve el usuario de la sesión activa, o null. Nunca lanza. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
      ),
    )
    .limit(1);

  const user = rows[0];
  if (!user) return null;
  // Un usuario suspendido conserva la fila de sesión pero pierde el acceso.
  if (user.status !== "ACTIVE") return null;
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError("FORBIDDEN");
  return user;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Cierra TODAS las sesiones de un usuario (suspensión, cambio de contraseña). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Comparación en tiempo constante para secretos cortos (cron, webhooks).
 * Evita filtrar información por el tiempo que tarda en fallar.
 */
export function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
