import { assertSameOrigin, ok, route } from "@/lib/api";
import { createDepositSchema } from "@/lib/validation";
import { consume, RULES } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { createDeposit } from "@/server/services/deposits";
import { getConfig } from "@/server/services/settings";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Solicitud de depósito por Yape. Llega como multipart porque incluye la
 * captura del comprobante. El archivo se valida por sus bytes reales en
 * `storeReceipt`, no por lo que declare el navegador.
 */
export const POST = route("deposits.create", async (req) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await consume(RULES.depositCreate, `user:${user.id}`);

  const form = await req.formData().catch(() => null);
  if (!form) throw new AppError("VALIDATION_ERROR", { userMessage: "Solicitud mal formada." });

  const amountRaw = form.get("amountCents");
  const operationCode = form.get("operationCode");
  const file = form.get("receipt");

  if (!(file instanceof File)) {
    throw new AppError("UPLOAD_INVALID", { userMessage: "Adjunta la captura del pago." });
  }

  const input = createDepositSchema.parse({
    amountCents: Number(amountRaw),
    operationCode: typeof operationCode === "string" && operationCode ? operationCode : undefined,
  });

  const config = await getConfig();
  if (input.amountCents < config.minDepositCents) {
    throw new AppError("VALIDATION_ERROR", {
      userMessage: `El monto mínimo es S/ ${(config.minDepositCents / 100).toFixed(2)}.`,
    });
  }

  const deposit = await createDeposit({
    userId: user.id,
    amountCents: input.amountCents,
    operationCode: input.operationCode,
    file,
  });

  return ok(
    {
      id: deposit.id,
      code: deposit.code,
      amountCents: deposit.amountCents,
      status: deposit.status,
      createdAt: deposit.createdAt,
    },
    201,
  );
});
