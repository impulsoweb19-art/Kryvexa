import { z } from "zod";

import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { setConfig } from "@/server/services/settings";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const schema = z.object({ enabled: z.boolean() });

/**
 * Pausar o reanudar las compras, al instante.
 *
 * Va aparte de PUT /api/admin/settings a propósito. Aquel guarda el formulario
 * ENTERO —tipo de cambio, margen, datos de Yape, redes— y exige pulsar
 * "Guardar" al final de una pantalla larga.
 *
 * Esto es un interruptor de emergencia: se usa cuando el proveedor se cayó y
 * los pedidos se están acumulando en revisión. El 17/10/2026 el dueño lo
 * desmarcó tres veces y las tres volvió a aparecer marcado, porque nunca llegó
 * a pulsar Guardar. Un corte de emergencia que depende de recordar un botón al
 * final de la página no es un corte de emergencia.
 */
export const POST = route("admin.compras", async (req) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const { enabled } = await parseJson(req, schema);

  await setConfig({ purchasesEnabled: enabled });

  // Queda en la bitácora: si un día la tienda "no vende" y nadie sabe por qué,
  // esta línea dice quién la pausó y cuándo.
  logger.info(enabled ? "Compras reanudadas" : "Compras PAUSADAS", { adminId: admin.id });

  return ok({ enabled });
});
