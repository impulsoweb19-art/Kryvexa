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
 * Llamar cada 2 minutos:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/reconcile-orders
 *
 * El secreto se compara en tiempo constante para no filtrar información por
 * la duración de la respuesta.
 */
function assertCron(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeCompare(token, env().CRON_SECRET)) {
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
