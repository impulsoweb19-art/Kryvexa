import "server-only";

import { Resend } from "resend";
import { env } from "./env";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Envío de correo vía Resend.
 *
 * Igual que con el almacenamiento de comprobantes: la ausencia de
 * RESEND_API_KEY no debe tumbar la web entera (ver `lib/env.ts`), así que la
 * comprobación vive aquí, justo antes de enviar, no en `env()`.
 */
let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env().RESEND_API_KEY);
  return client;
}

export async function sendVerificationCodeEmail(to: string, code: string): Promise<void> {
  if (!env().RESEND_API_KEY) {
    logger.error("RESEND_API_KEY no configurada: no se pudo enviar el código de verificación", { to });
    throw new AppError("INTERNAL", {
      userMessage: "No pudimos enviar el código de verificación. Intenta más tarde.",
      internalMessage: "RESEND_API_KEY no configurada",
    });
  }

  const { error } = await resend().emails.send({
    from: env().EMAIL_FROM,
    to,
    subject: `Tu código de verificación es ${code}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px">Confirma que eres tú</h2>
        <p style="color:#444;line-height:1.5">
          Usa este código para confirmar el cambio de contraseña en tu cuenta de Kryvexa.
          Vence en 10 minutos.
        </p>
        <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0;text-align:center">
          ${code}
        </p>
        <p style="color:#888;font-size:13px">
          Si no solicitaste esto, ignora este correo: tu contraseña no cambiará sin este código.
        </p>
      </div>
    `,
  });

  if (error) {
    logger.error("Resend: fallo al enviar código de verificación", { message: error.message, to });
    throw new AppError("INTERNAL", { userMessage: "No pudimos enviar el código de verificación. Intenta más tarde." });
  }
}
