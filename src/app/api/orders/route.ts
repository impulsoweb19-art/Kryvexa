import { assertSameOrigin, ok, parseJson, route } from "@/lib/api";
import { createOrderSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { createOrder } from "@/server/services/orders";
import { getBalance } from "@/server/services/wallet";

export const runtime = "nodejs";
/** Una compra habla con un proveedor externo: nunca debe cachearse. */
export const dynamic = "force-dynamic";

export const POST = route("orders.create", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await consume(RULES.orderCreate, `user:${user.id}`);

  const input = await parseJson(req, createOrderSchema);

  const { order, duplicated } = await createOrder({
    user,
    productId: input.productId,
    inputs: input.inputs,
    expectedPriceCents: input.expectedPriceCents,
    idempotencyKey: input.idempotencyKey,
  });

  const balance = await getBalance(user.id);

  return ok({
    duplicated,
    balanceCents: balance.balanceCents,
    order: {
      id: order.id,
      code: order.code,
      status: order.status,
      productName: order.productName,
      gameName: order.gameName,
      priceCents: order.priceCents,
      providerReference: order.providerReference,
      failureMessage: order.failureMessage,
      createdAt: order.createdAt,
    },
  });
});
