import "server-only";

import { desc, eq, and, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { auditLogs } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * Registro de auditoría. Toda acción administrativa que toque dinero, saldo o
 * el estado de una cuenta deja rastro aquí. Nunca se borra ni se edita.
 */
export interface AuditInput {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string; // "deposit.approve", "user.suspend", "settings.update"…
  entityType: string; // "deposit", "user", "order", "product", "settings"
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput, tx: DbOrTx = db): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    // Import diferido: fuera de un request (cron, scripts, pruebas) `next/headers`
    // no está disponible y no queremos que eso rompa la operación de negocio.
    const { headers } = await import("next/headers");
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim().slice(0, 64) ?? null;
    userAgent = h.get("user-agent")?.slice(0, 400) ?? null;
  } catch {
    // Sin contexto de petición: seguimos sin IP ni user-agent. No es un error.
  }

  try {
    await tx.insert(auditLogs).values({
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metaJson: input.meta ?? null,
      ip,
      userAgent,
    });
  } catch (e) {
    // La auditoría nunca debe tumbar la operación de negocio, pero sí gritar.
    logger.error("No se pudo escribir el registro de auditoría", {
      action: input.action,
      error: (e as Error).message,
    });
  }
}

export async function listAudit(opts: { entityType?: string; entityId?: string; limit?: number } = {}) {
  const conditions: SQL[] = [];
  if (opts.entityType) conditions.push(eq(auditLogs.entityType, opts.entityType));
  if (opts.entityId) conditions.push(eq(auditLogs.entityId, opts.entityId));

  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit ?? 50);
}
