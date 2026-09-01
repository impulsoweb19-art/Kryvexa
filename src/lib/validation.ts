/**
 * Esquemas Zod compartidos por cliente y servidor.
 *
 * El cliente los usa para feedback inmediato; el servidor SIEMPRE los vuelve a
 * aplicar. La validación de cliente es una cortesía, la de servidor es la real.
 */
import { z } from "zod";

/** Quita caracteres de control y espacios sobrantes. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export const cleanString = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, "").trim())
    .pipe(z.string().max(max));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Correo demasiado corto")
  .max(255)
  .email("Correo electrónico inválido");

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres") // límite real de bcrypt
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Debe incluir al menos una letra y un número");

export const registerSchema = z
  .object({
    name: cleanString(120).pipe(z.string().min(2, "Ingresa tu nombre")),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{6,20}$/, "Teléfono inválido")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos" }) }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresa tu contraseña").max(72),
});

/**
 * Edición de la propia cuenta.
 *
 * `currentPassword` es obligatoria siempre, incluso si solo se cambia el
 * nombre: es lo que impide que alguien con una sesión ajena abierta se quede
 * con la cuenta. La contraseña nueva es opcional (puede que solo se cambie el
 * correo), pero si se envía tiene que repetirse igual.
 */
export const accountSchema = z
  .object({
    name: cleanString(120).pipe(z.string().min(2, "Ingresa tu nombre")),
    email: emailSchema,
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual").max(72),
    newPassword: passwordSchema.optional().or(z.literal("").transform(() => undefined)),
    confirmNewPassword: z.string().optional(),
  })
  .refine((d) => !d.newPassword || d.newPassword === d.confirmNewPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmNewPassword"],
  })
  .refine((d) => !d.newPassword || d.newPassword !== d.currentPassword, {
    message: "La contraseña nueva debe ser distinta de la actual",
    path: ["newPassword"],
  });

/**
 * Recuperar contraseña sin sesión ("¿Olvidaste tu contraseña?" en el login).
 *
 * Dos pasos, dos esquemas: pedir el código (solo el correo) y confirmarlo
 * (correo + código + contraseña nueva). No se pide la contraseña actual
 * porque, precisamente, el usuario no la tiene.
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, "Ingresa el código de 6 dígitos"),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmNewPassword"],
  });

/** Importes de depósito: entre S/ 5.00 y S/ 2000.00 */
export const depositAmountSchema = z
  .number()
  .int("Importe inválido")
  .min(500, "El monto mínimo es S/ 5.00")
  .max(200_000, "El monto máximo por solicitud es S/ 2,000.00");

export const createDepositSchema = z.object({
  amountCents: depositAmountSchema,
  operationCode: cleanString(40).optional(),
});

export const rejectDepositSchema = z.object({
  depositId: z.string().min(1),
  reason: cleanString(300).pipe(z.string().min(3, "Explica brevemente el motivo")),
});

/** Los inputs del producto son dinámicos: {"input1":"123456789","input2":"3001"} */
export const productInputsSchema = z.record(
  z.string().regex(/^(input[1-9][0-9]?|redemption_id|quantity)$/, "Campo no permitido"),
  cleanString(64).pipe(z.string().min(1, "Campo obligatorio")),
);

export const validateAccountSchema = z.object({
  productId: z.string().min(1),
  accountId: cleanString(64).pipe(z.string().min(3, "Ingresa un ID válido")),
});

export const createOrderSchema = z.object({
  productId: z.string().min(1),
  inputs: productInputsSchema,
  /** Precio que el usuario vio. El servidor recalcula y compara. */
  expectedPriceCents: z.number().int().positive(),
  idempotencyKey: z.string().uuid("Clave de idempotencia inválida"),
});

export const settingsSchema = z.object({
  yapeHolderName: cleanString(120),
  yapePhone: cleanString(20),
  yapeInstructions: cleanString(600).optional(),
  supportWhatsapp: cleanString(20).optional(),
  supportEmail: z.string().email().or(z.literal("")).optional(),
  /**
   * Redes sociales. Se exige http(s) explícitamente: un enlace pegado a medias
   * («tiktok.com/@…» sin esquema) se interpretaría como ruta interna del sitio
   * y el botón llevaría a una página inexistente.
   */
  socialWhatsappChannel: z.string().url("Debe empezar por https://").or(z.literal("")).optional(),
  socialTiktok: z.string().url("Debe empezar por https://").or(z.literal("")).optional(),
  socialInstagram: z.string().url("Debe empezar por https://").or(z.literal("")).optional(),
  storeName: cleanString(80),
  exchangeRate: z.number().positive().max(20),
  marginBps: z.number().int().min(0).max(20_000),
  minDepositCents: z.number().int().min(100),
  purchasesEnabled: z.boolean(),
});

export const productOverrideSchema = z.object({
  productId: z.string().min(1),
  visible: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  priceCents: z.number().int().positive().nullable().optional(),
  marginBps: z.number().int().min(0).max(20_000).nullable().optional(),
});

/** Mostrar/ocultar varios productos de una sola vez (ver el botón "Seleccionar todos" del catálogo). */
export const bulkVisibilitySchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(2000),
  visible: z.boolean(),
});

export type AccountInput = z.infer<typeof accountSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type StoreSettings = z.infer<typeof settingsSchema>;
