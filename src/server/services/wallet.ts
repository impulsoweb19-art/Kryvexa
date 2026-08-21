import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { wallets, walletTransactions, type WalletTransaction } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  BILLETERA INTERNA — el módulo más delicado del sistema.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta billetera es NUESTRA y pertenece a cada usuario registrado. No tiene
 * ninguna relación con el endpoint /wallet de RecargasAmérica, que devuelve el
 * saldo del REVENDEDOR (la cuenta del negocio frente al proveedor).
 *
 * TRES GARANTÍAS, y cómo se consiguen:
 *
 *  1. El saldo nunca cambia sin dejar asiento.
 *     `applyTransaction` es el ÚNICO camino para tocar `balance_cents`, y
 *     escribe la fila en `wallet_transactions` dentro de la misma transacción
 *     SQL. O pasan las dos cosas, o no pasa ninguna.
 *
 *  2. Nada se duplica.
 *     Cada movimiento lleva una `idempotency_key` con índice UNIQUE. Reintentar
 *     la misma operación (doble clic, reintento de red, doble aprobación de un
 *     comprobante) devuelve el movimiento existente en lugar de crear otro.
 *
 *  3. Nada se pierde en una condición de carrera.
 *     Antes de leer el saldo se bloquea la fila con SELECT … FOR UPDATE. Dos
 *     compras simultáneas del mismo usuario se serializan: la segunda ve el
 *     saldo ya descontado por la primera y falla limpiamente si no alcanza.
 */

export interface ApplyTransactionInput {
  userId: string;
  direction: "CREDIT" | "DEBIT";
  reason: "DEPOSIT_APPROVED" | "ORDER_PAYMENT" | "ORDER_REFUND" | "ADMIN_ADJUSTMENT";
  /** Siempre positivo. El signo lo aporta `direction`. */
  amountCents: number;
  idempotencyKey: string;
  description?: string;
  refType?: "deposit" | "order" | "admin";
  refId?: string;
  createdById?: string;
}

export interface ApplyTransactionResult {
  transaction: WalletTransaction;
  balanceAfterCents: number;
  /** true si la clave ya existía: no se movió dinero esta vez. */
  duplicated: boolean;
}

/**
 * Aplica un movimiento. DEBE ejecutarse dentro de `db.transaction(...)`
 * para que el bloqueo de fila cubra también al llamador.
 */
export async function applyTransaction(
  tx: Tx,
  input: ApplyTransactionInput,
): Promise<ApplyTransactionResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("VALIDATION_ERROR", {
      internalMessage: `Importe inválido en applyTransaction: ${input.amountCents}`,
    });
  }

  // (1) ¿Ya se aplicó esta operación? Salida idempotente antes de tocar nada.
  const existing = await tx
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (existing[0]) {
    logger.info("Movimiento idempotente ignorado", {
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
    });
    return {
      transaction: existing[0],
      balanceAfterCents: existing[0].balanceAfterCents,
      duplicated: true,
    };
  }

  // (2) Candado pesimista sobre la billetera. A partir de aquí somos los únicos
  //     que podemos modificar este saldo hasta el COMMIT.
  const locked = await tx.execute<{ id: string; balance_cents: number }>(
    sql`SELECT id, balance_cents FROM wallets WHERE user_id = ${input.userId} FOR UPDATE`,
  );
  const walletRow = locked.rows[0];
  if (!walletRow) {
    throw new AppError("NOT_FOUND", {
      internalMessage: `El usuario ${input.userId} no tiene billetera`,
    });
  }

  const before = Number(walletRow.balance_cents);
  const delta = input.direction === "CREDIT" ? input.amountCents : -input.amountCents;
  const after = before + delta;

  // (3) Un débito nunca puede dejar la billetera en negativo.
  if (after < 0) {
    throw new AppError("INSUFFICIENT_FUNDS", {
      internalMessage: `Saldo insuficiente: tiene ${before}, necesita ${input.amountCents}`,
      details: { balanceCents: before, requiredCents: input.amountCents },
    });
  }

  // (4) Asiento contable + saldo, en la misma transacción.
  const inserted = await tx
    .insert(walletTransactions)
    .values({
      walletId: walletRow.id,
      direction: input.direction,
      reason: input.reason,
      amountCents: input.amountCents,
      balanceAfterCents: after,
      description: input.description ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      idempotencyKey: input.idempotencyKey,
      createdById: input.createdById ?? null,
    })
    .onConflictDoNothing({ target: walletTransactions.idempotencyKey })
    .returning();

  if (!inserted[0]) {
    // Carrera perdida contra otra transacción con la misma clave. No se
    // reintenta: el movimiento ya está aplicado por el otro camino.
    const [race] = await tx
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!race) throw new AppError("INTERNAL", { internalMessage: "Conflicto de idempotencia irrecuperable" });
    return { transaction: race, balanceAfterCents: race.balanceAfterCents, duplicated: true };
  }

  await tx
    .update(wallets)
    .set({ balanceCents: after, updatedAt: new Date() })
    .where(eq(wallets.id, walletRow.id));

  return { transaction: inserted[0], balanceAfterCents: after, duplicated: false };
}

/** Crea la billetera si no existe. Idempotente. */
export async function ensureWallet(userId: string, tx: Tx | typeof db = db) {
  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await tx
    .insert(wallets)
    .values({ userId })
    .onConflictDoNothing({ target: wallets.userId })
    .returning();
  if (created) return created;

  const [again] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!again) throw new AppError("INTERNAL", { internalMessage: "No se pudo crear la billetera" });
  return again;
}

export async function getBalance(userId: string) {
  const wallet = await ensureWallet(userId);
  return {
    balanceCents: wallet.balanceCents,
    pendingCents: wallet.pendingCents,
    currency: wallet.currency,
  };
}

export async function listMovements(userId: string, limit = 50, offset = 0) {
  const wallet = await ensureWallet(userId);
  return db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Ajusta el contador informativo de depósitos en revisión. */
export async function adjustPending(tx: Tx, userId: string, deltaCents: number) {
  await tx
    .update(wallets)
    .set({
      // GREATEST evita que un desfase deje el contador en negativo.
      pendingCents: sql`GREATEST(0, ${wallets.pendingCents} + ${deltaCents})`,
      updatedAt: new Date(),
    })
    .where(eq(wallets.userId, userId));
}

/**
 * Verificación de integridad contable: la suma del libro mayor debe coincidir
 * con el saldo almacenado. La usa el panel admin y la batería de pruebas.
 */
export async function auditIntegrity(userId: string): Promise<{
  balanceCents: number;
  ledgerCents: number;
  consistent: boolean;
}> {
  const wallet = await ensureWallet(userId);
  const [row] = await db
    .select({
      ledger: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.direction} = 'CREDIT'
        THEN ${walletTransactions.amountCents} ELSE -${walletTransactions.amountCents} END), 0)`,
    })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.walletId, wallet.id)));

  const ledgerCents = Number(row?.ledger ?? 0);
  return {
    balanceCents: wallet.balanceCents,
    ledgerCents,
    consistent: ledgerCents === wallet.balanceCents,
  };
}
