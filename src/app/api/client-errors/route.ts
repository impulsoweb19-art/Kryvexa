import { ok, route } from "@/lib/api";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Buzón de diagnóstico del navegador.
 *
 * Existe porque hay fallos que solo ocurren en el teléfono de algunos
 * compradores —la subida del comprobante muere antes de salir del navegador y
 * en el servidor no queda ni rastro de la petición—, y sin el error real del
 * lado del cliente solo se puede especular.
 *
 * A propósito NO exige sesión ni comprueba el origen: si algo está bloqueando
 * las peticiones de ese navegador, añadir requisitos solo haría que este aviso
 * también se pierda. Tampoco confía en lo que recibe: no escribe en la base de
 * datos, solo deja una línea en la bitácora, recortada.
 */
export const POST = route("client.error", async (req) => {
  const body = await req.json().catch(() => null);

  logger.warn("Fallo reportado por el navegador", {
    contexto: String((body as { contexto?: unknown })?.contexto ?? "").slice(0, 60),
    detalle: String((body as { detalle?: unknown })?.detalle ?? "").slice(0, 300),
    navegador: req.headers.get("user-agent")?.slice(0, 160) ?? null,
  });

  return ok({ recibido: true });
});
