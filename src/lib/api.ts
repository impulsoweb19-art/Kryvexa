import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { AppError, isAppError } from "./errors";
import { logger } from "./logger";

/**
 * Envoltorio único para todos los Route Handlers.
 *
 * Garantiza que NUNCA se filtre al cliente un stack trace, un mensaje de
 * PostgreSQL ni el texto crudo del proveedor. Lo técnico va al log; al usuario
 * le llega un código estable y una frase clara.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(error: AppError) {
  return NextResponse.json(error.toJSON(), { status: error.status });
}

export function handleError(error: unknown, context: string) {
  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error(`[${context}] ${error.code}`, { message: error.message, details: error.details });
    } else {
      logger.info(`[${context}] ${error.code}`, { message: error.message });
    }
    return fail(error);
  }

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return fail(new AppError("VALIDATION_ERROR", { details: { fields: fieldErrors } }));
  }

  // Cualquier otra cosa es un bug nuestro: se registra completo, se responde genérico.
  logger.error(`[${context}] error no controlado`, {
    message: (error as Error)?.message,
    stack: (error as Error)?.stack,
  });
  return fail(new AppError("INTERNAL"));
}

/** Envuelve un handler para que jamás propague una excepción sin traducir. */
export function route<Args extends unknown[]>(
  context: string,
  handler: (req: Request, ...args: Args) => Promise<Response>,
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(req, ...args);
    } catch (error) {
      return handleError(error, context);
    }
  };
}

/** Parsea y valida el cuerpo JSON. Lanza AppError si el JSON es inválido. */
export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", { userMessage: "Solicitud mal formada." });
  }
  return schema.parse(body);
}

/** IP del cliente para rate limiting. Confía en x-forwarded-for del proxy. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "0.0.0.0";
}

/**
 * Defensa CSRF en profundidad: además de la cookie SameSite=Lax, exigimos que
 * el Origin coincida con el host. Un formulario en otro dominio no puede
 * falsificar esta cabecera.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // navegación directa o cliente no-navegador
  const host = req.headers.get("host");
  try {
    if (new URL(origin).host !== host) {
      throw new AppError("FORBIDDEN", { internalMessage: `Origin no permitido: ${origin}` });
    }
  } catch (e) {
    if (isAppError(e)) throw e;
    throw new AppError("FORBIDDEN", { internalMessage: `Origin inválido: ${origin}` });
  }
}
