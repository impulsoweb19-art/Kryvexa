import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { consultaCuentaSchema } from "@/lib/validation";
import {
  consultarCuenta,
  externalIdDeNivel,
  externalIdDeOferta,
  type Comprable,
} from "@/server/services/sixoff";
import { findSellableByExternalIds } from "@/server/services/catalog";

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
  const resultado = await consultarCuenta(uid);

  /*
    Se cruza lo que el jugador TIENE disponible con lo que el dueño VENDE. Sin
    esto la pantalla solo informaría, y lo que él quiere es que se compre con
    saldo igual que los pases: la promoción detectada lleva a un artículo
    manual que entra en su cola de entrega a mano.

    Lo que no tenga artículo creado simplemente se muestra sin botón, en vez de
    llevar a una compra que no existe.
  */
  const porExternalId = new Map<string, string>();
  for (const p of resultado.packages) porExternalId.set(externalIdDeNivel(p.itemId), p.itemId);
  for (const o of resultado.offers) {
    if (o.diamonds !== null) porExternalId.set(externalIdDeOferta(o.diamonds), o.itemId);
  }

  const vendibles = await findSellableByExternalIds([...porExternalId.keys()]);
  const comprables: Record<string, Comprable> = {};
  for (const [externalId, itemId] of porExternalId) {
    const producto = vendibles.get(externalId);
    if (producto) comprables[itemId] = { productId: producto.id, priceCents: producto.priceCents };
  }

  return ok({ ...resultado, comprables });
});
