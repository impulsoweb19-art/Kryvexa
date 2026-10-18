import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { safeCompare } from "@/lib/session";
import { reconcilePendingOrders } from "@/server/services/orders";
import { purgeExpired } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conciliación de órdenes PENDING.
 *
 * ── HORARIO (ver `vercel.json`) ─────────────────────────────────────────────
 * Cada 5 minutos entre las 08:00 y las 23:59 de Lima — el cron de Vercel va en
 * UTC, y Lima es UTC-5.
 *
 * Estuvo configurado "0 7 * * *", una vez al día, mientras el código se
 * escribía para minutos. Un pedido de las seis de la tarde no se cerraba hasta
 * las siete de la mañana siguiente, y como se rinde a los 12 intentos, tardaba
 * DOCE DÍAS en llegar a "necesita revisión". El dueño lo vivía como pedidos
 * que se quedaban "En proceso" para siempre.
 *
 * No se deja las 24 horas porque cada ejecución despierta a Neon, y lo que se
 * ahorra de madrugada —cuando no compra nadie— son horas de cómputo que ya una
 * vez estuvieron a punto de tumbar la tienda.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Llamar a mano:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/reconcile-orders
 *
 * El secreto se compara en tiempo constante para no filtrar información por
 * la duración de la respuesta.
 */
function assertCron(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const secret = env().CRON_SECRET;
  // Sin secreto configurado no se atiende a nadie: es preferible que la tarea
  // programada no corra que dejar este endpoint abierto al mundo.
  if (!secret) {
    throw new AppError("FORBIDDEN", {
      internalMessage: "CRON_SECRET no está configurado; las tareas programadas quedan deshabilitadas",
    });
  }
  if (!token || !safeCompare(token, secret)) {
    throw new AppError("FORBIDDEN", { internalMessage: "CRON_SECRET inválido" });
  }
}

export const POST = route("cron.reconcile", async (req) => {
  assertCron(req);
  const summary = await reconcilePendingOrders();
  const purged = await purgeExpired();
  logger.info("Conciliación ejecutada", { ...summary, rateLimitsPurged: purged });
  return ok(summary);
});

export const GET = POST;
