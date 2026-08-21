import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { validateAccountSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { getProductById } from "@/server/services/catalog";
import { getProvider } from "@/server/providers/registry";
import { AppError } from "@/lib/errors";

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
  const result = await provider.validateAccount({
    externalId: product.externalId,
    kind: product.kind,
    accountId: input.accountId,
  });

  return ok(result);
});
