import { ok, route } from "@/lib/api";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { safeCompare } from "@/lib/session";
import { syncCatalog } from "@/server/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El catálogo de EpinBy trae ~2500 productos en ~25 páginas; aunque se piden
// en paralelo, sigue siendo más lento que una petición normal. Margen extra
// para que no se corte a medio sincronizar.
export const maxDuration = 60;

/**
 * Refresco del catálogo. Llamar cada 30-60 minutos:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/sync-catalog
 */
export const POST = route("cron.syncCatalog", async (req) => {
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

  const result = await syncCatalog();
  return ok(result);
});

export const GET = POST;
