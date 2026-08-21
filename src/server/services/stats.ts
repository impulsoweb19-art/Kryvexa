import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { depositRequests, orders, users, wallets } from "@/db/schema";
import { getProvider, DEFAULT_PROVIDER } from "@/server/providers/registry";
import type { ProviderHealth } from "@/server/providers/types";

/** Métricas del panel de administración. Consultas agregadas, no bucles en JS. */
export async function dashboardStats() {
  const [userRow] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) FILTER (WHERE ${users.status} = 'ACTIVE')`,
      last7d: sql<number>`count(*) FILTER (WHERE ${users.createdAt} > now() - interval '7 days')`,
    })
    .from(users)
    .where(eq(users.role, "USER"));

  const [depositRow] = await db
    .select({
      pending: sql<number>`count(*) FILTER (WHERE ${depositRequests.status} = 'PENDING')`,
      pendingCents: sql<number>`COALESCE(SUM(${depositRequests.amountCents}) FILTER (WHERE ${depositRequests.status} = 'PENDING'), 0)`,
      approvedCents: sql<number>`COALESCE(SUM(${depositRequests.amountCents}) FILTER (WHERE ${depositRequests.status} = 'APPROVED'), 0)`,
      approvedTodayCents: sql<number>`COALESCE(SUM(${depositRequests.amountCents}) FILTER (WHERE ${depositRequests.status} = 'APPROVED' AND ${depositRequests.reviewedAt} > date_trunc('day', now())), 0)`,
    })
    .from(depositRequests);

  const [orderRow] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'COMPLETED')`,
      pending: sql<number>`count(*) FILTER (WHERE ${orders.status} IN ('PENDING','PROCESSING'))`,
      needsReview: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'NEEDS_REVIEW')`,
      // Pedidos de productos de entrega manual (Pase Booyah, Membresías…) que
      // todavía nadie entregó a mano. Aparecen aparte en "Avisos accionables"
      // porque a estos SIEMPRE los cierra un administrador, nunca el proveedor.
      pendingManual: sql<number>`count(*) FILTER (WHERE ${orders.status} IN ('PENDING','PROCESSING') AND ${orders.providerCode} = 'manual')`,
      salesCents: sql<number>`COALESCE(SUM(${orders.priceCents}) FILTER (WHERE ${orders.status} = 'COMPLETED'), 0)`,
      salesTodayCents: sql<number>`COALESCE(SUM(${orders.priceCents}) FILTER (WHERE ${orders.status} = 'COMPLETED' AND ${orders.createdAt} > date_trunc('day', now())), 0)`,
      costUsdCents: sql<number>`COALESCE(SUM(${orders.costUsdCents}) FILTER (WHERE ${orders.status} = 'COMPLETED'), 0)`,
    })
    .from(orders);

  const [walletRow] = await db
    .select({ liabilityCents: sql<number>`COALESCE(SUM(${wallets.balanceCents}), 0)` })
    .from(wallets);

  return {
    users: {
      total: Number(userRow?.total ?? 0),
      active: Number(userRow?.active ?? 0),
      last7d: Number(userRow?.last7d ?? 0),
    },
    deposits: {
      pending: Number(depositRow?.pending ?? 0),
      pendingCents: Number(depositRow?.pendingCents ?? 0),
      approvedCents: Number(depositRow?.approvedCents ?? 0),
      approvedTodayCents: Number(depositRow?.approvedTodayCents ?? 0),
    },
    orders: {
      total: Number(orderRow?.total ?? 0),
      completed: Number(orderRow?.completed ?? 0),
      pending: Number(orderRow?.pending ?? 0),
      needsReview: Number(orderRow?.needsReview ?? 0),
      pendingManual: Number(orderRow?.pendingManual ?? 0),
      salesCents: Number(orderRow?.salesCents ?? 0),
      salesTodayCents: Number(orderRow?.salesTodayCents ?? 0),
      costUsdCents: Number(orderRow?.costUsdCents ?? 0),
    },
    /** Saldo total en billeteras: es dinero que le debemos a los usuarios. */
    walletLiabilityCents: Number(walletRow?.liabilityCents ?? 0),
  };
}

export async function latestOrders(limit = 8) {
  return db
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      priceCents: orders.priceCents,
      productName: orders.productName,
      gameName: orders.gameName,
      createdAt: orders.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

/** Estado de la conexión con la API externa. Nunca lanza: es un widget. */
export async function providerHealth(): Promise<ProviderHealth> {
  try {
    return await getProvider(DEFAULT_PROVIDER).health();
  } catch (e) {
    return {
      ok: false,
      configured: false,
      mock: false,
      latencyMs: null,
      balanceCents: null,
      currency: null,
      message: (e as Error).message,
    };
  }
}

export async function listUsersForAdmin(opts: { search?: string; limit?: number; offset?: number }) {
  const q = opts.search?.trim().toLowerCase();
  const where = q
    ? sql`(lower(${users.email}) LIKE ${`%${q}%`} OR lower(${users.name}) LIKE ${`%${q}%`})`
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      balanceCents: wallets.balanceCents,
    })
    .from(users)
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(opts.limit ?? 25)
    .offset(opts.offset ?? 0);

  const [{ value }] = await db.select({ value: sql<number>`count(*)` }).from(users).where(where);
  return { rows, total: Number(value ?? 0) };
}
