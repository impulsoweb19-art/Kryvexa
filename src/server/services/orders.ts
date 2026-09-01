import "server-only";

import { and, count, desc, eq, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, users, type Order, type OrderStatus, type Product } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { humanCode } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { applyTransaction, ensureWallet } from "./wallet";
import { getPurchasableProduct, sellPriceCents } from "./catalog";
import { recordAudit } from "./audit";
import { getProvider } from "@/server/providers/registry";
import { ProviderRequestError } from "@/server/providers/recargas-america/client";
import type { ProviderInputField, ProviderOrderStatus, PurchaseResult } from "@/server/providers/types";
import type { SessionUser } from "@/lib/session";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MOTOR DE ÓRDENES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Secuencia (punto 7 del brief), y por qué está en este orden:
 *
 *   1. Validar producto, precio e inputs        (nada se cobra todavía)
 *   2. TRANSACCIÓN SQL:
 *        · INSERT de la orden con idempotency_key UNIQUE  → mata el doble clic
 *        · SELECT … FOR UPDATE sobre la billetera         → serializa carreras
 *        · comprobar saldo y DEBITAR con asiento           → o todo, o nada
 *      COMMIT
 *   3. FUERA de la transacción: llamar al proveedor.
 *      Nunca se mantiene abierta una transacción de base de datos mientras se
 *      espera una respuesta HTTP: bloquearía la fila hasta 30 segundos.
 *   4. Mapear la respuesta a NUESTROS estados y cerrar la orden.
 *   5. Si falló de forma CONOCIDA → reembolso idempotente.
 *      Si el resultado es DESCONOCIDO (timeout, red caída) → NO se reembolsa:
 *      la orden queda PENDING y la resuelve la conciliación. Reembolsar a
 *      ciegas una recarga que sí se entregó sería regalar dinero.
 */

const MAX_RECONCILE_ATTEMPTS = 12; // ≈ 24 min con el cron cada 2 minutos

export interface CreateOrderInput {
  user: SessionUser;
  productId: string;
  inputs: Record<string, string>;
  expectedPriceCents: number;
  idempotencyKey: string;
}

export interface CreateOrderResult {
  order: Order;
  duplicated: boolean;
}

/** Comprueba que los inputs recibidos cubren exactamente lo que pide el producto. */
export function assertInputsMatch(product: Product, inputs: Record<string, string>) {
  const fields = (product.inputFields as ProviderInputField[]) ?? [];

  if (fields.length === 0) {
    // La API no declaró campos: no adivinamos cuáles enviar.
    throw new AppError("PRODUCT_UNAVAILABLE", {
      userMessage: "Este producto no está configurado correctamente. Avísanos, por favor.",
      internalMessage: `El producto ${product.id} no tiene input_fields`,
    });
  }

  for (const field of fields) {
    const value = inputs[field.name];
    if (!value || !value.trim()) {
      throw new AppError("VALIDATION_ERROR", {
        userMessage: `Completa el campo "${field.label}".`,
      });
    }
  }

  const allowed = new Set(fields.map((f) => f.name));
  for (const key of Object.keys(inputs)) {
    if (!allowed.has(key)) {
      throw new AppError("VALIDATION_ERROR", {
        userMessage: "Los datos enviados no corresponden a este producto.",
        internalMessage: `Campo no esperado: ${key}`,
      });
    }
  }
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const { product, config } = await getPurchasableProduct(input.productId);
  const priceCents = sellPriceCents(product, config);

  // El precio del cliente NUNCA manda: aquí solo se compara.
  if (priceCents !== input.expectedPriceCents) {
    throw new AppError("PRICE_CHANGED", { details: { priceCents } });
  }

  assertInputsMatch(product, input.inputs);
  await ensureWallet(input.user.id);

  // ── Fase transaccional: crear la orden y cobrar, o nada ────────────────────
  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(orders)
      .values({
        code: humanCode("ORD"),
        userId: input.user.id,
        productId: product.id,
        providerCode: product.providerCode,
        productName: product.packageName,
        gameName: product.gameName,
        productKind: product.kind,
        externalId: product.externalId,
        priceCents,
        costUsdCents: product.costUsdCents,
        inputs: input.inputs as never,
        status: "PROCESSING",
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning();

    if (!inserted[0]) {
      // Misma clave → mismo intento. Devolvemos la orden original sin cobrar otra vez.
      const [existing] = await tx
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (!existing) throw new AppError("CONFLICT");
      return { order: existing, duplicated: true };
    }

    const order = inserted[0];

    await applyTransaction(tx, {
      userId: input.user.id,
      direction: "DEBIT",
      reason: "ORDER_PAYMENT",
      amountCents: priceCents,
      idempotencyKey: `order:${order.id}:payment`,
      description: `Compra ${order.code} — ${product.gameName} ${product.packageName}`,
      refType: "order",
      refId: order.id,
    });

    return { order, duplicated: false };
  });

  if (created.duplicated) return created;

  // ── Fase externa: hablar con el proveedor ────────────────────────────────
  const finalOrder = await executePurchase(created.order, product);

  await recordAudit({
    actorId: input.user.id,
    action: "order.create",
    entityType: "order",
    entityId: finalOrder.id,
    meta: { status: finalOrder.status, priceCents, productId: product.id },
  });

  return { order: finalOrder, duplicated: false };
}

/** Llama al proveedor y cierra la orden. No lanza: siempre devuelve la orden. */
async function executePurchase(order: Order, product: Product): Promise<Order> {
  const provider = getProvider(order.providerCode);

  let result: PurchaseResult;
  try {
    result = await provider.purchase(
      {
        externalId: order.externalId,
        kind: order.productKind,
        inputs: order.inputs as Record<string, string>,
        clientReference: order.code,
      },
      order.id,
    );
  } catch (e) {
    const err = e as ProviderRequestError;

    if (err instanceof ProviderRequestError && err.resultUnknown) {
      // No sabemos si se entregó. NO se reembolsa: se deja para conciliar.
      logger.warn("Resultado desconocido del proveedor; la orden queda pendiente", {
        orderId: order.id,
        kind: err.kind,
      });
      return updateOrder(order.id, {
        status: "PENDING",
        failureCode: err.kind,
        failureMessage: "Sin confirmación del proveedor; pendiente de verificación.",
        lastCheckedAt: new Date(),
      });
    }

    // Error de negocio conocido (saldo del revendedor, producto inválido, 4xx/5xx
    // con cuerpo interpretable): el proveedor no ejecutó nada. Reembolso inmediato.
    logger.error("El proveedor rechazó la orden", {
      orderId: order.id,
      code: err instanceof ProviderRequestError ? err.providerCode : null,
      message: (e as Error).message,
    });
    await refundOrder(order.id, "Rechazada por el proveedor");
    return updateOrder(order.id, {
      status: "REFUNDED",
      failureCode: (err instanceof ProviderRequestError ? err.providerCode : null) ?? "PROVIDER_ERROR",
      failureMessage: "El proveedor no pudo completar la recarga.",
    });
  }

  switch (result.status) {
    case "COMPLETED":
      return updateOrder(order.id, {
        status: "COMPLETED",
        providerReference: result.reference,
        providerTxId: result.transactionId,
        resultJson: result.raw as never,
        completedAt: new Date(),
      });

    case "PENDING":
      return updateOrder(order.id, {
        status: "PENDING",
        providerReference: result.reference,
        providerTxId: result.transactionId,
        resultJson: result.raw as never,
        lastCheckedAt: new Date(),
      });

    case "FAILED":
      await refundOrder(order.id, "El proveedor reportó la orden como fallida");
      return updateOrder(order.id, {
        status: "REFUNDED",
        providerReference: result.reference,
        providerTxId: result.transactionId,
        resultJson: result.raw as never,
        failureCode: result.errorCode ?? "PROVIDER_FAILED",
        failureMessage: "El proveedor no pudo completar la recarga.",
      });

    default:
      // Estado no reconocido: jamás se da por buena una entrega.
      logger.warn("Estado desconocido devuelto por el proveedor", {
        orderId: order.id,
        productId: product.id,
      });
      return updateOrder(order.id, {
        status: "PENDING",
        providerReference: result.reference,
        providerTxId: result.transactionId,
        resultJson: result.raw as never,
        lastCheckedAt: new Date(),
      });
  }
}

async function updateOrder(orderId: string, patch: Partial<Order>): Promise<Order> {
  const [updated] = await db
    .update(orders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  return updated;
}

/**
 * Devuelve el saldo de una orden. Idempotente por diseño: la clave
 * `order:{id}:refund` solo puede acreditarse una vez, aunque esta función
 * se invoque dos veces desde caminos distintos.
 */
export async function refundOrder(orderId: string, reason: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;
    if (order.refundedAt) return;

    const res = await applyTransaction(tx, {
      userId: order.userId,
      direction: "CREDIT",
      reason: "ORDER_REFUND",
      amountCents: order.priceCents,
      idempotencyKey: `order:${order.id}:refund`,
      description: `Devolución de ${order.code} — ${reason}`,
      refType: "order",
      refId: order.id,
    });

    await tx.update(orders).set({ refundedAt: new Date() }).where(eq(orders.id, order.id));

    logger.info("Orden reembolsada", {
      orderId: order.id,
      amountCents: order.priceCents,
      duplicated: res.duplicated,
    });
  });
}

/**
 * Aplica el veredicto que reporta el proveedor a una orden puntual —lo usa el
 * webhook de EpinBy, y sirve para cualquier otro proveedor que en el futuro
 * quiera avisar por webhook en vez de esperar a la conciliación por cron.
 *
 * Es SEGURO llamarla más de una vez con el mismo resultado (los proveedores
 * pueden reenviar la misma notificación): si la orden ya no está
 * PENDING/PROCESSING, no hace nada.
 */
export async function applyProviderStatus(
  orderId: string,
  status: ProviderOrderStatus,
  raw: unknown,
): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  if (order.status !== "PENDING" && order.status !== "PROCESSING") return; // ya se cerró, no se toca

  if (status === "COMPLETED") {
    await updateOrder(order.id, {
      status: "COMPLETED",
      resultJson: raw as never,
      completedAt: new Date(),
    });
  } else if (status === "FAILED") {
    await refundOrder(order.id, "El proveedor reportó la orden como fallida");
    await updateOrder(order.id, {
      status: "REFUNDED",
      resultJson: raw as never,
      failureCode: "PROVIDER_FAILED",
      failureMessage: "El proveedor no pudo completar la recarga.",
    });
  }
  // PENDING/PROCESSING/UNKNOWN: sin novedad, la conciliación por cron lo sigue vigilando.
}

/**
 * Conciliación de órdenes PENDING (la ejecuta el cron).
 *
 * Consulta GET /orders/{reference} y cierra lo que ya tenga veredicto. Tras
 * MAX_RECONCILE_ATTEMPTS sin respuesta clara, la orden pasa a NEEDS_REVIEW:
 * la decide una persona, no una heurística.
 */
export async function reconcilePendingOrders(limit = 25) {
  const pending = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "PENDING"),
        or(sql`${orders.lastCheckedAt} IS NULL`, lt(orders.lastCheckedAt, new Date(Date.now() - 60_000))),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  const summary = { checked: 0, completed: 0, refunded: 0, stillPending: 0, needsReview: 0 };

  for (const order of pending) {
    summary.checked += 1;
    const attempts = order.attempts + 1;

    // Sin `reference` no hay nada que consultar: solo puede resolverlo una persona.
    if (!order.providerReference) {
      if (attempts >= MAX_RECONCILE_ATTEMPTS) {
        await updateOrder(order.id, { status: "NEEDS_REVIEW", attempts, lastCheckedAt: new Date() });
        summary.needsReview += 1;
      } else {
        await updateOrder(order.id, { attempts, lastCheckedAt: new Date() });
        summary.stillPending += 1;
      }
      continue;
    }

    try {
      const provider = getProvider(order.providerCode);
      const status = await provider.getOrderStatus(order.providerReference, order.id);

      if (status.status === "COMPLETED") {
        await updateOrder(order.id, {
          status: "COMPLETED",
          resultJson: status.raw as never,
          completedAt: new Date(),
          attempts,
          lastCheckedAt: new Date(),
        });
        summary.completed += 1;
      } else if (status.status === "FAILED") {
        await refundOrder(order.id, "El proveedor cerró la orden como fallida");
        await updateOrder(order.id, {
          status: "REFUNDED",
          resultJson: status.raw as never,
          failureCode: "PROVIDER_FAILED",
          failureMessage: "El proveedor no pudo completar la recarga.",
          attempts,
          lastCheckedAt: new Date(),
        });
        summary.refunded += 1;
      } else if (attempts >= MAX_RECONCILE_ATTEMPTS) {
        await updateOrder(order.id, { status: "NEEDS_REVIEW", attempts, lastCheckedAt: new Date() });
        summary.needsReview += 1;
      } else {
        await updateOrder(order.id, { attempts, lastCheckedAt: new Date() });
        summary.stillPending += 1;
      }
    } catch (e) {
      logger.warn("Fallo al conciliar una orden", { orderId: order.id, error: (e as Error).message });
      await updateOrder(order.id, { attempts, lastCheckedAt: new Date() });
      summary.stillPending += 1;
    }
  }

  return summary;
}

/** Reembolso manual desde el panel, para órdenes en NEEDS_REVIEW. */
export async function adminResolveOrder(
  admin: SessionUser,
  orderId: string,
  resolution: "COMPLETED" | "REFUNDED",
  note?: string,
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new AppError("NOT_FOUND");
  if (!["PENDING", "NEEDS_REVIEW", "PROCESSING"].includes(order.status)) {
    throw new AppError("CONFLICT", { userMessage: "Esta orden ya está cerrada." });
  }

  if (resolution === "REFUNDED") {
    await refundOrder(order.id, note ?? "Resolución manual del administrador");
  }

  const updated = await updateOrder(order.id, {
    status: resolution,
    failureMessage: note ?? null,
    completedAt: resolution === "COMPLETED" ? new Date() : order.completedAt,
  });

  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "order.resolve",
    entityType: "order",
    entityId: order.id,
    meta: { resolution, note },
  });

  return updated;
}

// ── Consultas ────────────────────────────────────────────────────────────────

export async function listUserOrders(userId: string, limit = 30, offset = 0) {
  return db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getOrderForViewer(orderId: string, viewer: SessionUser) {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  if (viewer.role !== "ADMIN" && row.userId !== viewer.id) throw new AppError("FORBIDDEN");
  return row;
}

export async function listOrdersForAdmin(opts: {
  status?: OrderStatus;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions: SQL[] = [];
  if (opts.status) conditions.push(eq(orders.status, opts.status));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(${users.email}) LIKE ${q} OR lower(${orders.code}) LIKE ${q}
           OR lower(COALESCE(${orders.providerReference}, '')) LIKE ${q}
           OR lower(${orders.inputs}::text) LIKE ${q})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({ order: orders, user: { id: users.id, name: users.name, email: users.email } })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 25)
    .offset(opts.offset ?? 0);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(where);

  return { rows, total: Number(total) };
}

/** Órdenes que requieren atención humana: NEEDS_REVIEW o mucho tiempo en PENDING. */
export async function listStuckOrders() {
  return db
    .select()
    .from(orders)
    .where(
      or(
        eq(orders.status, "NEEDS_REVIEW"),
        and(eq(orders.status, "PENDING"), lt(orders.createdAt, new Date(Date.now() - 30 * 60_000))),
        and(eq(orders.status, "PROCESSING"), lt(orders.createdAt, new Date(Date.now() - 10 * 60_000))),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(50);
}

export async function orderProductNames() {
  return db
    .select({ id: products.id, name: products.packageName })
    .from(products)
    .where(isNotNull(products.id));
}

export async function countOrdersByStatus(statuses: OrderStatus[]) {
  const [row] = await db
    .select({ value: count() })
    .from(orders)
    .where(inArray(orders.status, statuses));
  return Number(row?.value ?? 0);
}
