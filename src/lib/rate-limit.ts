import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { AppError } from "./errors";

/**
 * Rate limiting por ventana fija, persistido en PostgreSQL.
 *
 * Se hace con un único UPSERT atómico, así que es correcto incluso con varias
 * instancias de la app detrás de un balanceador (a diferencia de un Map en
 * memoria, que se reinicia con cada deploy y no se comparte entre procesos).
 */
export interface RateLimitRule {
  /** Identificador de la acción: "login", "register", "order.create"… */
  action: string;
  /** Intentos permitidos dentro de la ventana. */
  limit: number;
  /** Duración de la ventana en segundos. */
  windowSec: number;
}

export const RULES = {
  login: { action: "login", limit: 8, windowSec: 15 * 60 },
  /** Evita que se use el formulario de cuenta para adivinar la contraseña actual. */
  accountUpdate: { action: "account.update", limit: 10, windowSec: 15 * 60 },
  register: { action: "register", limit: 5, windowSec: 60 * 60 },
  depositCreate: { action: "deposit.create", limit: 10, windowSec: 60 * 60 },
  orderCreate: { action: "order.create", limit: 20, windowSec: 10 * 60 },
  validatePlayer: { action: "player.validate", limit: 30, windowSec: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

export async function consume(rule: RateLimitRule, identifier: string): Promise<void> {
  const windowStart = Math.floor(Date.now() / 1000 / rule.windowSec) * rule.windowSec;
  const key = `${rule.action}:${identifier}:${windowStart}`;
  const expiresAt = new Date((windowStart + rule.windowSec) * 1000);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (row && row.count > rule.limit) {
    const retryInSec = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    throw new AppError("RATE_LIMITED", {
      userMessage: `Demasiados intentos. Inténtalo de nuevo en ${Math.ceil(retryInSec / 60)} minuto(s).`,
      internalMessage: `rate limit excedido: ${key} (${row.count}/${rule.limit})`,
      details: { retryInSec },
    });
  }
}

/** Limpieza de ventanas vencidas. La ejecuta el cron. */
export async function purgeExpired(): Promise<number> {
  const res = await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < now()`).returning({ k: rateLimits.key });
  return res.length;
}
