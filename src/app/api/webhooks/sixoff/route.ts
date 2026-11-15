import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { clientIp } from "@/lib/api";
import { logger, redact } from "@/lib/logger";
import { consume, RULES } from "@/lib/rate-limit";
import { getProvider } from "@/server/providers/registry";
import { PROVIDER_CODE } from "@/server/providers/sixoff";
import { applyProviderStatus, reconcilePendingOrders } from "@/server/services/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aviso de SixoFire sobre un pedido de su tienda.
 *
 * Se registra al crear cada pedido, en el campo `webhook_url`, y avisan de
 * `order.created`, `order.progress`, `order.complete`, `order.error` y
 * `order.paused`.
 *
 * ── ESTA RUTA NO SE CREE NADA DE LO QUE RECIBE ──────────────────────────────
 * Devuelven un `signingSecret` y una cabecera `X-SixoFire-Signature`, pero no
 * documentan cómo se calcula la firma: ni sobre qué se hace el HMAC, ni si va
 * en hexadecimal o en base64, ni si entra una marca de tiempo. Una
 * verificación escrita a ojo o rechaza todo lo legítimo o acepta cualquier
 * cosa, y lo segundo es peor que no comprobar nada, porque da falsa
 * tranquilidad.
 *
 * Así que del cuerpo solo se saca un número de pedido, y el estado se le
 * pregunta a SixoFire con NUESTRA clave. Un aviso falsificado consigue, como
 * mucho, que miremos un pedido antes de tiempo.
 *
 * ── Y TAMPOCO SE FÍA DE LA FORMA DEL CUERPO ─────────────────────────────────
 * Tampoco documentan el cuerpo del aviso. La primera versión buscaba el id
 * solo en `data.id` o `id` y, si no estaba, respondía 204 sin hacer nada: en
 * la noche del 14 al 15/11/2026 no se cerró ni un pedido y el dueño encontró
 * las entregas desfasadas ocho horas. Su asesor confirmó que los avisos sí
 * salen, así que el que no entendía era este código.
 *
 * Ahora se busca el id en los sitios habituales Y, si aun así no aparece, se
 * repasan igualmente los pedidos pendientes. Porque el aviso en el fondo solo
 * significa "algo cambió, ve a mirar", y eso se puede obedecer sin entender
 * una sola palabra del cuerpo. De paso se registra el cuerpo entero: es la
 * única forma de aprender su formato real.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Que llegue el mismo aviso dos veces es inofensivo: `applyProviderStatus` no
 * toca una orden que ya se cerró.
 */
export async function POST(req: Request) {
  try {
    await consume(RULES.webhookSixoff, clientIp(req));
  } catch {
    // 429 para que lo reintenten más tarde en vez de darlo por entregado.
    return new Response(null, { status: 429 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    logger.warn("Webhook de SixoFire con cuerpo no interpretable");
    // 2xx a propósito: reintentarlo no lo va a volver legible.
    return new Response(null, { status: 204 });
  }

  const referencia = buscarReferencia(payload);

  if (!referencia) {
    /*
      El cuerpo entero al log, que es como se descubre el formato que no
      documentan. Va por `redact`, que tapa el `signingSecret` por si lo
      incluyen.
    */
    logger.warn("Webhook de SixoFire sin referencia reconocible: se repasa todo", {
      cuerpo: redact(payload),
    });
    await reconcilePendingOrders(25);
    return new Response(null, { status: 204 });
  }

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.providerReference, referencia))
    .limit(1);

  if (!order) {
    logger.warn("Webhook de SixoFire para un pedido que no es nuestro", { referencia });
    return new Response(null, { status: 204 });
  }

  try {
    const estado = await getProvider(PROVIDER_CODE).getOrderStatus(referencia, order.id);
    await applyProviderStatus(order.id, estado.status, estado.raw);
  } catch (e) {
    logger.warn("No se pudo confirmar con SixoFire el pedido avisado", {
      referencia,
      error: (e as Error).message,
    });
    /*
      500 para que lo reintenten: si no pudimos preguntarles, el aviso todavía
      sirve. Y si no vuelven a avisar, la conciliación por cron lo recoge
      igual, que para eso sigue corriendo.
    */
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 204 });
}

/**
 * Busca el id del pedido allá donde lo pongan.
 *
 * Su respuesta de creación lo trae en `data.id`, así que ese es el candidato
 * más probable, pero el cuerpo del aviso no tiene por qué seguir la misma
 * forma. Se prueban los nombres que usa todo el mundo antes de rendirse.
 *
 * Solo se aceptan dígitos: sus ids son enteros, y así un valor con cualquier
 * otra cosa dentro no llega nunca a la consulta.
 */
function buscarReferencia(payload: Record<string, unknown>): string | null {
  const data = (payload.data ?? payload.order ?? {}) as Record<string, unknown>;

  const candidatos = [
    data.id,
    data.orderId,
    data.order_id,
    payload.id,
    payload.orderId,
    payload.order_id,
    payload.saleOrderId,
    payload.sale_order_id,
  ];

  for (const c of candidatos) {
    if (typeof c === "number" && Number.isInteger(c) && c > 0) return String(c);
    if (typeof c === "string" && /^[0-9]+$/.test(c)) return c;
  }
  return null;
}
