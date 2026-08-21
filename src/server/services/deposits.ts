import "server-only";

import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { depositRequests, users, type DepositStatus } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { humanCode } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { adjustPending, applyTransaction, ensureWallet } from "./wallet";
import { storeReceipt } from "./storage";
import { recordAudit } from "./audit";
import type { SessionUser } from "@/lib/session";

/**
 * Depósitos por Yape con acreditación MANUAL (punto 4 del brief).
 *
 * El punto crítico es que un mismo comprobante no acredite saldo dos veces.
 * Se resuelve con dos candados independientes:
 *
 *  1. Transición condicional: el UPDATE lleva `WHERE status = 'PENDING'`.
 *     Si dos administradores pulsan «Aprobar» a la vez, solo uno cambia la
 *     fila; el otro recibe 0 filas afectadas y se le informa del conflicto.
 *
 *  2. Idempotencia contable: el abono usa la clave `deposit:{id}:credit`,
 *     con índice UNIQUE. Aunque el paso 1 fallara, el dinero no se duplica.
 */

export async function createDeposit(input: {
  userId: string;
  amountCents: number;
  operationCode?: string;
  file: File;
}) {
  const receipt = await storeReceipt(input.file);
  await ensureWallet(input.userId);

  const [deposit] = await db
    .insert(depositRequests)
    .values({
      code: humanCode("DEP"),
      userId: input.userId,
      amountCents: input.amountCents,
      operationCode: input.operationCode ?? null,
      receiptPath: receipt.relativePath,
      receiptMime: receipt.mime,
      receiptSize: receipt.size,
      status: "PENDING",
    })
    .returning();

  await db.transaction(async (tx) => {
    await adjustPending(tx, input.userId, input.amountCents);
  });

  await recordAudit({
    actorId: input.userId,
    action: "deposit.create",
    entityType: "deposit",
    entityId: deposit.id,
    meta: { amountCents: input.amountCents, code: deposit.code },
  });

  return deposit;
}

export async function approveDeposit(admin: SessionUser, depositId: string) {
  return db.transaction(async (tx) => {
    // (1) Transición condicional: solo una aprobación puede ganar.
    const [deposit] = await tx
      .update(depositRequests)
      .set({
        status: "APPROVED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "PENDING")))
      .returning();

    if (!deposit) {
      const [current] = await tx
        .select({ status: depositRequests.status })
        .from(depositRequests)
        .where(eq(depositRequests.id, depositId))
        .limit(1);
      if (!current) throw new AppError("NOT_FOUND", { userMessage: "La solicitud no existe." });
      throw new AppError("CONFLICT", {
        userMessage: `Esta solicitud ya fue ${current.status === "APPROVED" ? "aprobada" : "rechazada"}.`,
      });
    }

    // (2) Abono idempotente.
    const result = await applyTransaction(tx, {
      userId: deposit.userId,
      direction: "CREDIT",
      reason: "DEPOSIT_APPROVED",
      amountCents: deposit.amountCents,
      idempotencyKey: `deposit:${deposit.id}:credit`,
      description: `Depósito ${deposit.code} aprobado`,
      refType: "deposit",
      refId: deposit.id,
      createdById: admin.id,
    });

    await adjustPending(tx, deposit.userId, -deposit.amountCents);

    await recordAudit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "deposit.approve",
        entityType: "deposit",
        entityId: deposit.id,
        meta: {
          amountCents: deposit.amountCents,
          balanceAfterCents: result.balanceAfterCents,
          duplicated: result.duplicated,
        },
      },
      tx,
    );

    logger.info("Depósito aprobado", {
      depositId: deposit.id,
      adminId: admin.id,
      amountCents: deposit.amountCents,
    });

    return { deposit, balanceAfterCents: result.balanceAfterCents };
  });
}

export async function rejectDeposit(admin: SessionUser, depositId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [deposit] = await tx
      .update(depositRequests)
      .set({
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "PENDING")))
      .returning();

    if (!deposit) {
      throw new AppError("CONFLICT", { userMessage: "Esta solicitud ya fue revisada." });
    }

    // Rechazar NO mueve saldo: solo libera el contador informativo.
    await adjustPending(tx, deposit.userId, -deposit.amountCents);

    await recordAudit(
      {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "deposit.reject",
        entityType: "deposit",
        entityId: deposit.id,
        meta: { amountCents: deposit.amountCents, reason },
      },
      tx,
    );

    return deposit;
  });
}

export async function listUserDeposits(userId: string, limit = 30) {
  return db
    .select()
    .from(depositRequests)
    .where(eq(depositRequests.userId, userId))
    .orderBy(desc(depositRequests.createdAt))
    .limit(limit);
}

export async function listDepositsForAdmin(opts: {
  status?: DepositStatus;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions: SQL[] = [];
  if (opts.status) conditions.push(eq(depositRequests.status, opts.status));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(${users.email}) LIKE ${q} OR lower(${users.name}) LIKE ${q} OR lower(${depositRequests.code}) LIKE ${q})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      deposit: depositRequests,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(depositRequests)
    .innerJoin(users, eq(users.id, depositRequests.userId))
    .where(where)
    .orderBy(desc(depositRequests.createdAt))
    .limit(opts.limit ?? 25)
    .offset(opts.offset ?? 0);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(depositRequests)
    .innerJoin(users, eq(users.id, depositRequests.userId))
    .where(where);

  return { rows, total: Number(total) };
}

export async function getDepositForViewer(depositId: string, viewer: SessionUser) {
  const [row] = await db
    .select()
    .from(depositRequests)
    .where(eq(depositRequests.id, depositId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND");
  // Un usuario solo puede ver SU comprobante; el admin puede ver todos.
  if (viewer.role !== "ADMIN" && row.userId !== viewer.id) throw new AppError("FORBIDDEN");
  return row;
}
