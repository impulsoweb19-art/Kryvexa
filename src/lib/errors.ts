/**
 * Errores de dominio.
 *
 * Regla: el usuario final ve `userMessage` (texto claro, sin detalles
 * técnicos). El detalle real va al log del servidor. Nunca se filtran
 * mensajes crudos del proveedor ni trazas de la base de datos.
 */

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ACCOUNT_SUSPENDED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "PRICE_CHANGED"
  | "PRODUCT_UNAVAILABLE"
  | "INVALID_PLAYER_ID"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "PROVIDER_NOT_CONFIGURED"
  | "ORDER_PENDING"
  | "UPLOAD_INVALID"
  | "SESSION_EXPIRED"
  | "INTERNAL";

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHENTICATED: "Debes iniciar sesión para continuar.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  ACCOUNT_SUSPENDED: "Tu cuenta está suspendida. Escríbenos para más información.",
  VALIDATION_ERROR: "Revisa los datos ingresados.",
  RATE_LIMITED: "Demasiados intentos. Espera un momento y vuelve a intentarlo.",
  NOT_FOUND: "No encontramos lo que buscas.",
  CONFLICT: "Esta operación ya fue procesada.",
  INSUFFICIENT_FUNDS: "Saldo insuficiente. Recarga tu billetera para continuar.",
  PRICE_CHANGED: "El precio cambió mientras completabas la compra. Revísalo y confirma de nuevo.",
  PRODUCT_UNAVAILABLE: "Este producto no está disponible en este momento.",
  INVALID_PLAYER_ID: "El ID de jugador no es válido o no fue encontrado.",
  PROVIDER_UNAVAILABLE: "El servicio de recargas no está disponible ahora. Intenta en unos minutos.",
  PROVIDER_ERROR: "No pudimos completar la recarga. Si se descontó tu saldo, ya fue devuelto.",
  PROVIDER_NOT_CONFIGURED: "Las compras están temporalmente deshabilitadas.",
  ORDER_PENDING: "Tu recarga está en proceso. Te avisaremos en cuanto se confirme.",
  UPLOAD_INVALID: "El archivo no es válido. Sube una imagen JPG, PNG o WebP de máximo 5 MB.",
  SESSION_EXPIRED: "Tu sesión expiró. Inicia sesión nuevamente.",
  INTERNAL: "Ocurrió un error inesperado. Ya estamos revisándolo.",
};

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ACCOUNT_SUSPENDED: 403,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_FUNDS: 422,
  PRICE_CHANGED: 409,
  PRODUCT_UNAVAILABLE: 422,
  INVALID_PLAYER_ID: 422,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  PROVIDER_NOT_CONFIGURED: 503,
  ORDER_PENDING: 202,
  UPLOAD_INVALID: 422,
  SESSION_EXPIRED: 401,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    opts: { userMessage?: string; internalMessage?: string; details?: unknown } = {},
  ) {
    super(opts.internalMessage ?? opts.userMessage ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.userMessage = opts.userMessage ?? DEFAULT_MESSAGES[code];
    this.details = opts.details;
  }

  toJSON() {
    return { success: false as const, code: this.code, error: this.userMessage, details: this.details };
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export function messageFor(code: AppErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
