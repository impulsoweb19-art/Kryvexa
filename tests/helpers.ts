/**
 * Utilidades para las pruebas de integración.
 *
 * Se ejecutan contra una base PostgreSQL real (la misma que usa la app), porque
 * lo que estamos comprobando —bloqueos de fila, índices UNIQUE, transacciones—
 * es precisamente lo que un doble simulado no puede reproducir.
 */
(process.env as Record<string, string>).NODE_ENV ??= "test";
process.env.SESSION_SECRET ??= "pruebas-secreto-suficientemente-largo-0123456789";
process.env.CRON_SECRET ??= "pruebas-cron-secreto";
process.env.PROVIDER_MOCK ??= "true";
process.env.DATABASE_URL ??= "postgresql://postgres@localhost:5432/recargas";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { products, users, wallets } from "@/db/schema";
import { applyTransaction } from "@/server/services/wallet";

let counter = 0;

export async function createTestUser(balanceCents = 0) {
  counter += 1;
  const email = `test-${Date.now()}-${counter}@example.com`;

  const [user] = await db
    .insert(users)
    .values({ email, name: "Usuario de prueba", passwordHash: "x", role: "USER", status: "ACTIVE" })
    .returning();

  await db.insert(wallets).values({ userId: user.id });

  // El saldo inicial se acredita por el camino normal, con su asiento contable.
  // Insertarlo a mano rompería la invariante que estas pruebas verifican.
  if (balanceCents > 0) {
    await db.transaction((tx) =>
      applyTransaction(tx, {
        userId: user.id,
        direction: "CREDIT",
        reason: "ADMIN_ADJUSTMENT",
        amountCents: balanceCents,
        idempotencyKey: `test-seed:${user.id}`,
        description: "Saldo inicial de prueba",
      }),
    );
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: "USER" as const,
    status: "ACTIVE" as const,
  };
}

/** Administrador real (con fila en la base): los FK de auditoría lo exigen. */
export async function createTestAdmin() {
  counter += 1;
  const [admin] = await db
    .insert(users)
    .values({
      email: `admin-${Date.now()}-${counter}@example.com`,
      name: "Admin de prueba",
      passwordHash: "x",
      role: "ADMIN",
      status: "ACTIVE",
    })
    .returning();
  await db.insert(wallets).values({ userId: admin.id });
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: "ADMIN" as const,
    status: "ACTIVE" as const,
  };
}

export async function createTestProduct(overrides: Partial<typeof products.$inferInsert> = {}) {
  counter += 1;
  const [product] = await db
    .insert(products)
    .values({
      providerCode: "recargas_america",
      externalId: `test-${Date.now()}-${counter}`,
      kind: "GAME_PACKAGE",
      gameName: "Free Fire (MY)",
      packageName: "100 Diamonds",
      costUsdCents: 374,
      priceCents: 1780, // precio fijo: aísla la prueba del tipo de cambio
      inputFields: [
        { name: "input1", label: "Player ID" },
        { name: "input2", label: "Server ID" },
      ] as never,
      validationSupported: false,
      active: true,
      visible: true,
      ...overrides,
    })
    .returning();
  return product;
}

export async function balanceOf(userId: string): Promise<number> {
  const res = await db.execute<{ balance_cents: number }>(
    sql`SELECT balance_cents FROM wallets WHERE user_id = ${userId}`,
  );
  return Number(res.rows[0]?.balance_cents ?? 0);
}

/** Suma del libro mayor. Debe coincidir siempre con el saldo almacenado. */
export async function ledgerOf(userId: string): Promise<number> {
  const res = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(CASE WHEN wt.direction = 'CREDIT' THEN wt.amount_cents ELSE -wt.amount_cents END), 0) AS total
    FROM wallet_transactions wt
    JOIN wallets w ON w.id = wt.wallet_id
    WHERE w.user_id = ${userId}
  `);
  return Number(res.rows[0]?.total ?? 0);
}
