import { z } from "zod";

import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { setConfig } from "@/server/services/settings";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const schema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(300).optional(),
});

/**
 * Encender, apagar o reescribir el cartel de la tienda.
 *
 * Va aparte del formulario grande de configuración por el mismo motivo que el
 * corte de compras: se usa con prisa, cuando el proveedor se quedó sin stock y
 * hay clientes entrando. Un aviso que depende de bajar hasta el final de una
 * pantalla larga y acordarse de pulsar "Guardar" llega tarde — y eso ya pasó
 * una vez con el interruptor de compras.
 */
export const POST = route("admin.aviso", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { enabled, text } = await parseJson(req, schema);

  await setConfig({
    storeNoticeEnabled: enabled,
    ...(text !== undefined ? { storeNoticeText: text } : {}),
  });

  logger.info(enabled ? "Cartel de la tienda ENCENDIDO" : "Cartel de la tienda apagado", {
    adminId: admin.id,
  });

  return ok({ enabled });
});
