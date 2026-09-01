import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mapProviderStatus } from "@/server/providers/epinby/mapper";
import { applyProviderStatus } from "@/server/services/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de EpinBy — confirma órdenes de forma más rápida que esperar al
 * cron de conciliación (que igual sigue corriendo como respaldo).
 *
 * Verificación de firma documentada en https://epinby.com/docs (sección
 * "Signature Verification"): HMAC-SHA256 del cuerpo crudo con
 * EPINBY_WEBHOOK_SECRET, en el header `X-GAMEX-Signature` con formato
 * "sha256=<hex>".
 *
 * Es SEGURO que EpinBy reenvíe la misma notificación más de una vez:
 * `applyProviderStatus` no hace nada si la orden ya no está pendiente.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-gamex-signature") ?? "";

  const secret = env().EPINBY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Webhook de EpinBy recibido sin EPINBY_WEBHOOK_SECRET configurado");
    return new Response(null, { status: 500 });
  }

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    logger.warn("Webhook de EpinBy con firma inválida o ausente");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: {
    order_id?: number | string;
    client_order_id?: string;
    status?: string;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn("Webhook de EpinBy con cuerpo no interpretable");
    // 2xx a propósito: un cuerpo ilegible nunca se va a poder procesar
    // reintentando, así que no tiene sentido que EpinBy siga reenviándolo.
    return new Response(null, { status: 204 });
  }

  const clientOrderId = payload.client_order_id ?? null;
  const providerReference = payload.order_id != null ? String(payload.order_id) : null;

  if (!clientOrderId && !providerReference) {
    logger.warn("Webhook de EpinBy sin client_order_id ni order_id");
    return new Response(null, { status: 204 });
  }

  // `client_order_id` es el código de orden que nosotros mismos enviamos como
  // X-Idempotency-Key al crear (ver epinby/index.ts): buscar por ahí es más
  // directo, y `providerReference` queda de respaldo por si llega vacío.
  const conditions = [];
  if (clientOrderId) conditions.push(eq(orders.code, clientOrderId));
  if (providerReference) conditions.push(eq(orders.providerReference, providerReference));

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(or(...conditions))
    .limit(1);

  if (!order) {
    logger.warn("Webhook de EpinBy para una orden que no existe localmente", {
      clientOrderId,
      providerReference,
    });
    return new Response(null, { status: 204 });
  }

  await applyProviderStatus(order.id, mapProviderStatus(payload.status), payload);

  return new Response(null, { status: 204 });
}

function verifySignature(rawBody: string, header: string, secret: string): boolean {
  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return false;

  const provided = header.slice(prefix.length);
  const computed = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const providedBuf = Buffer.from(provided, "hex");
  const computedBuf = Buffer.from(computed, "hex");
  if (providedBuf.length !== computedBuf.length) return false;

  return timingSafeEqual(providedBuf, computedBuf);
}
