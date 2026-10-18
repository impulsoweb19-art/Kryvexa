import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { consultaCuentaSchema } from "@/lib/validation";
import { consultarCuenta } from "@/server/services/sixoff";

export const runtime = "nodejs";

/**
 * Consulta qué ofertas y paquetes de nivel tiene una cuenta de Free Fire.
 *
 * ── POR QUÉ EXIGE SESIÓN ────────────────────────────────────────────────────
 * Cada consulta descuenta DOS peticiones de la cuota mensual que paga el
 * dueño, incluso cuando el jugador no tiene nada disponible. Abierta al
 * público, bastaría con que alguien la recargara en bucle para dejarlo sin
 * cuota —y sin vender— hasta el mes siguiente.
 *
 * Pedir sesión no es una barrera comercial: quien va a comprar ya tiene cuenta
 * con saldo, y quien no la tiene se registra en medio minuto.
 * ────────────────────────────────────────────────────────────────────────────
 */
export const POST = route("cuenta.consulta", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await consume(RULES.consultaCuenta, `user:${user.id}`);

  const { uid } = await parseJson(req, consultaCuentaSchema);
  return ok(await consultarCuenta(uid));
});
