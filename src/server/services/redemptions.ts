import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, redemptionCodes, users, type RedemptionCode } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { humanCode } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { recordAudit } from "./audit";
import type { SessionUser } from "@/lib/session";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CÓDIGOS DE CANJE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un código sirve UNA vez en toda la tienda. El punto delicado es justamente
 * ese: si diez personas pegan el mismo código a la vez, solo una puede
 * llevárselo.
 *
 * NO se resuelve leyendo y luego escribiendo —entre la lectura y la escritura
 * caben las otras nueve—, sino con una sola instrucción que reclama el código
 * y comprueba la condición al mismo tiempo:
 *
 *   UPDATE … SET redeemed_at = now() WHERE code = ? AND redeemed_at IS NULL
 *
 * PostgreSQL serializa esa operación: el primero cambia la fila, los demás no
 * afectan ninguna y reciben "ya canjeado". Es el mismo candado que impide que
 * dos administradores aprueben el mismo depósito.
 */

/**
 * Alfabeto sin caracteres que se confunden al teclear (0/O, 1/I/L).
 * Estos códigos se dictan por WhatsApp y se escriben a mano.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIX = "KRYV";
const SUFFIX_LENGTH = 5;

export const MAX_CODES_PER_BATCH = 200;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH));
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `${PREFIX}-${suffix}`;
}

/** Tolera minúsculas, espacios y que olviden el guion. */
export function normalizeCode(input: string): string {
  const limpio = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!limpio.startsWith(PREFIX)) return limpio;
  return `${PREFIX}-${limpio.slice(PREFIX.length)}`;
}

export async function generateCodes(
  admin: SessionUser,
  input: { prize: string; count: number },
): Promise<RedemptionCode[]> {
  const count = Math.min(Math.max(1, Math.trunc(input.count)), MAX_CODES_PER_BATCH);
  const creados: RedemptionCode[] = [];

  for (let i = 0; i < count; i++) {
    // Un choque es improbable (31^5 ≈ 28 millones), pero si ocurre se
    // reintenta en vez de fallar el lote entero.
    for (let intento = 0; intento < 5; intento++) {
      const [row] = await db
        .insert(redemptionCodes)
        .values({ code: randomCode(), prize: input.prize, createdById: admin.id })
        .onConflictDoNothing({ target: redemptionCodes.code })
        .returning();
      if (row) {
        creados.push(row);
        break;
      }
    }
  }

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "redemption.generate",
    entityType: "redemption_code",
    meta: { count: creados.length, prize: input.prize },
  });

  return creados;
}

/**
 * Canjea un código y deja un pedido de entrega manual esperando en el panel.
 *
 * El pedido va SIN producto del catálogo (`productId` nulo) y con precio cero:
 * un premio no se cobra, y el premio en sí es el texto que escribió el
 * administrador, no un paquete que esté a la venta.
 */
export async function redeemCode(
  user: SessionUser,
  rawCode: string,
  playerId: string,
): Promise<{ code: RedemptionCode; orderCode: string }> {
  const code = normalizeCode(rawCode);

  // ── El candado: reclamar y comprobar en una sola instrucción ──────────────
  const [claimed] = await db
    .update(redemptionCodes)
    .set({ redeemedById: user.id, redeemedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(redemptionCodes.code, code), isNull(redemptionCodes.redeemedAt)))
    .returning();

  if (!claimed) {
    // Puede ser que no exista o que alguien se haya adelantado. Se distingue
    // para no dejar al usuario pensando que escribió mal un código válido.
    const [existente] = await db
      .select({ id: redemptionCodes.id })
      .from(redemptionCodes)
      .where(eq(redemptionCodes.code, code))
      .limit(1);

    throw new AppError("CONFLICT", {
      userMessage: existente
        ? "Este código ya fue canjeado por otra persona."
        : "Ese código no existe. Revisa que esté bien escrito.",
    });
  }

  // ── El premio queda esperando entrega manual ──────────────────────────────
  try {
    const [order] = await db
      .insert(orders)
      .values({
        code: humanCode("ORD"),
        userId: user.id,
        productId: null,
        providerCode: "manual",
        productName: claimed.prize,
        gameName: "Free Fire — Canje",
        productKind: "GAME_PACKAGE",
        externalId: `canje-${claimed.code}`,
        priceCents: 0,
        costUsdCents: 0,
        inputs: { player_id: playerId } as never,
        status: "PENDING",
        // Atado al código: aunque esto se ejecutara dos veces, el premio no se
        // duplica.
        idempotencyKey: `canje:${claimed.id}`,
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning();

    if (!order) throw new Error("La orden del canje ya existía");

    await db
      .update(redemptionCodes)
      .set({ orderId: order.id, updatedAt: new Date() })
      .where(eq(redemptionCodes.id, claimed.id));

    await recordAudit({
      actorId: user.id,
      action: "redemption.redeem",
      entityType: "redemption_code",
      entityId: claimed.id,
      meta: { code: claimed.code, prize: claimed.prize, orderCode: order.code },
    });

    logger.info("Código canjeado", { code: claimed.code, userId: user.id, orderId: order.id });
    return { code: claimed, orderCode: order.code };
  } catch (e) {
    // Si el premio no llegó a quedar registrado, el código NO puede quedarse
    // gastado: sería quitárselo a alguien sin darle nada a cambio.
    await db
      .update(redemptionCodes)
      .set({ redeemedById: null, redeemedAt: null, updatedAt: new Date() })
      .where(eq(redemptionCodes.id, claimed.id));

    logger.error("Fallo al registrar el premio; se liberó el código", {
      code: claimed.code,
      message: (e as Error).message,
    });
    throw new AppError("INTERNAL", {
      userMessage: "No pudimos registrar tu premio. Intenta de nuevo en un momento.",
    });
  }
}

export interface CodeRow {
  id: string;
  code: string;
  prize: string;
  redeemedAt: Date | null;
  /** El nombre con el que se registró: es como el dueño reconoce a su gente. */
  redeemedByName: string | null;
  redeemedByEmail: string | null;
  orderCode: string | null;
  createdAt: Date;
}

export async function listCodes(limit = 200): Promise<CodeRow[]> {
  const rows = await db
    .select({
      id: redemptionCodes.id,
      code: redemptionCodes.code,
      prize: redemptionCodes.prize,
      redeemedAt: redemptionCodes.redeemedAt,
      redeemedByName: users.name,
      redeemedByEmail: users.email,
      orderCode: orders.code,
      createdAt: redemptionCodes.createdAt,
    })
    .from(redemptionCodes)
    .leftJoin(users, eq(users.id, redemptionCodes.redeemedById))
    .leftJoin(orders, eq(orders.id, redemptionCodes.orderId))
    .orderBy(desc(redemptionCodes.createdAt))
    .limit(limit);

  return rows;
}

export async function countCodes(): Promise<{ total: number; redeemed: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      redeemed: sql<number>`count(${redemptionCodes.redeemedAt})::int`,
    })
    .from(redemptionCodes);
  return { total: Number(row?.total ?? 0), redeemed: Number(row?.redeemed ?? 0) };
}
