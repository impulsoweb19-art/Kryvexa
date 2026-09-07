import "server-only";

import { env } from "./env";
import { logger } from "./logger";

/**
 * Notificación por WhatsApp al dueño del negocio cuando entra un pedido de
 * entrega manual (ver `server/services/orders.ts`).
 *
 * A diferencia de `sendVerificationCodeEmail`, esto NUNCA lanza: es un aviso
 * de cortesía, no un paso crítico del flujo de compra. Si Twilio no está
 * configurado o falla, se registra el error y la orden sigue su curso
 * normal (el dueño igual la ve en /admin/pedidos).
 *
 * Usa una plantilla (Content API) porque WhatsApp exige que el negocio use
 * un mensaje pre-aprobado por Meta para iniciar la conversación — el dueño
 * nunca le escribe primero al número de Kryvexa.
 */
const CONTENT_SID = "HX54de009fba380ca0eb8c024d48b437ec";

export async function sendManualOrderNotification(input: {
  code: string;
  productLabel: string;
  priceCents: number;
  customerLabel: string;
}): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_NOTIFY_WHATSAPP_TO } = env();

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM || !TWILIO_NOTIFY_WHATSAPP_TO) {
    logger.warn("Twilio no configurado: se omite la notificación de WhatsApp", { code: input.code });
    return;
  }

  const priceLabel = (input.priceCents / 100).toFixed(2);

  const body = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: TWILIO_NOTIFY_WHATSAPP_TO,
    ContentSid: CONTENT_SID,
    ContentVariables: JSON.stringify({
      "1": input.code,
      "2": input.productLabel,
      "3": priceLabel,
      "4": input.customerLabel,
    }),
  });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error("Twilio: fallo al enviar notificación de WhatsApp", {
        code: input.code,
        status: res.status,
        body: text,
      });
    }
  } catch (e) {
    logger.error("Twilio: error de red al enviar notificación de WhatsApp", {
      code: input.code,
      message: (e as Error).message,
    });
  }
}
