import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { validateAccountSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { getProductById } from "@/server/services/catalog";
import { getProvider } from "@/server/providers/registry";
import { AppError } from "@/lib/errors";
import { ProviderRequestError } from "@/server/providers/types";

export const runtime = "nodejs";

/**
 * Precheck del ID de jugador (POST /pins/validate del proveedor).
 *
 * IMPORTANTE: la documentación limita este endpoint a productos de
 * /products/pins con type=recharge. Para los paquetes de /products/games NO
 * existe validación documentada; en ese caso devolvemos `supported:false` y la
 * interfaz pide al usuario una confirmación explícita del ID. No inventamos
 * una llamada que la API no ofrece.
 */
export const POST = route("catalog.validate", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await consume(RULES.validatePlayer, `user:${user.id}`);

  const input = await parseJson(req, validateAccountSchema);
  const product = await getProductById(input.productId);
  if (!product || !product.active) throw new AppError("PRODUCT_UNAVAILABLE");

  const provider = getProvider(product.providerCode);

  try {
    return ok(
      await provider.validateAccount({
        externalId: product.externalId,
        kind: product.kind,
        accountId: input.accountId,
      }),
    );
  } catch (e) {
    if (!(e instanceof ProviderRequestError)) throw e;

    // "No pude preguntar" NO es "el ID está mal". Se degrada a
    // `supported:false` para que el comprador pueda confirmarlo a mano, igual
    // que con los productos que no admiten verificación.
    if (e.resultUnknown || (e.httpStatus ?? 0) >= 500) {
      return ok({ supported: false, valid: false, accountName: null, reason: null });
    }

    // Negativa explícita del proveedor. Antes esto acababa en un "error
    // interno" genérico y el comprador, sin saber qué había fallado, volvía a
    // intentarlo: el 26/09/2026 se gastaron cuatro pedidos seguidos así, todos
    // cancelados por REGION_MISMATCH. Ahora se le dice qué pasa.
    return ok({ supported: true, valid: false, accountName: null, reason: explicarRechazo(e) });
  }
});

/** Traduce el código del proveedor a algo que el comprador pueda accionar. */
function explicarRechazo(err: ProviderRequestError): string {
  const detalles = (err.raw as { error?: { details?: Record<string, unknown> } } | null)?.error
    ?.details;
  const region = typeof detalles?.actual_region === "string" ? detalles.actual_region : null;

  switch (err.providerCode) {
    case "REGION_MISMATCH":
      return region
        ? `Esa cuenta es de la región ${region} y este paquete solo recarga cuentas de América. Revisa tu ID y tu Server ID.`
        : "Esa cuenta pertenece a otra región y este paquete no puede recargarla. Revisa tu ID y tu Server ID.";
    case "PLAYER_NOT_FOUND":
    case "INVALID_PLAYER":
    case "INVALID_PLAYER_ID":
      return "No existe ninguna cuenta con esos datos. Revisa tu ID y tu Server ID.";
    default:
      return "El proveedor rechazó esos datos. Revisa tu ID y tu Server ID antes de comprar.";
  }
}
