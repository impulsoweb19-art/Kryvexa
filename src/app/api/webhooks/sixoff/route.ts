import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { clientIp } from "@/lib/api";
import { logger } from "@/lib/logger";
import { consume, RULES } from "@/lib/rate-limit";
import { getProvider } from "@/server/providers/registry";
import { PROVIDER_CODE } from "@/server/providers/sixoff";
import { applyProviderStatus } from "@/server/services/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aviso de SixoFire sobre un pedido de su tienda.
 *
 * Se registra al crear cada pedido, en el campo `webhook_url`, y ellos avisan
 * de `order.created`, `order.progress`, `order.complete`, `order.error` y
 * `order.paused`.
 *
 * ── POR QUÉ ESTE NO VERIFICA LA FIRMA ───────────────────────────────────────
 * Su respuesta de creación devuelve un `signingSecret` y dice que la firma
 * viaja en la cabecera `X-SixoFire-Signature`, pero NO documenta cómo se
 * calcula: ni sobre qué se hace el HMAC, ni si va en hexadecimal o en base64,
 * ni si entra una marca de tiempo. Escribir una verificación a ojo tiene dos
 * finales, y los dos son malos: o rechaza todos los avisos legítimos, o
 * acepta cualquier cosa y da una falsa sensación de seguridad.
 *
 * Así que esta ruta NO SE CREE NADA de lo que recibe. Del cuerpo solo saca un
 * número de pedido, y el estado se lo pregunta a SixoFire con NUESTRA clave,
 * igual que hace la conciliación por cron. Un aviso falsificado consigue, como
 * mucho, que miremos un pedido antes de tiempo.
 *
 * Cuando documenten el algoritmo se añade la comprobación de firma encima,
 * como segunda barrera. Pero el diseño ya no depende de ella.
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

  let payload: { id?: number | string; data?: { id?: number | string }; event?: string };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    logger.warn("Webhook de SixoFire con cuerpo no interpretable");
    // 2xx a propósito: reintentarlo no lo va a volver legible.
    return new Response(null, { status: 204 });
  }

  // El identificador aparece como `data.id` en su respuesta de creación; se
  // acepta también en la raíz por si el aviso viaja más plano.
  const bruto = payload.data?.id ?? payload.id;
  const referencia = bruto != null ? String(bruto) : null;

  if (!referencia || !/^[0-9]+$/.test(referencia)) {
    logger.warn("Webhook de SixoFire sin un id de pedido utilizable", { event: payload.event });
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
