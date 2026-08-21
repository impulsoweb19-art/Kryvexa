import "server-only";

import type { ProductKind } from "@/db/schema";

/**
 * CONTRATO MULTI-PROVEEDOR
 *
 * Todo lo que el resto de la aplicación sabe de un proveedor externo está aquí.
 * Añadir un segundo proveedor (punto 12 del brief) consiste en:
 *   1. crear `src/server/providers/<nuevo>/` que implemente `ProviderAdapter`
 *   2. registrarlo en `registry.ts`
 * Ni la billetera, ni las órdenes, ni la UI cambian.
 *
 * Los tipos de aquí son NUESTROS. Las respuestas crudas del proveedor no salen
 * nunca de su carpeta: el `mapper` las traduce a estas formas.
 */

/** Campo que el proveedor exige para ejecutar la recarga (input_fields). */
export interface ProviderInputField {
  /** "input1", "input2", "redemption_id"… tal cual lo espera el proveedor. */
  name: string;
  label: string;
  /** Pista de teclado/validación para la UI. Deducida, no inventada por la API. */
  type?: "text" | "number";
  placeholder?: string;
}

export interface ProviderProduct {
  externalId: string;
  kind: ProductKind;
  sku?: string | null;
  gameName: string;
  packageName: string;
  /** Precio del proveedor en céntimos de USD (nuestro costo). */
  costUsdCents: number;
  inputFields: ProviderInputField[];
  /** true solo si el proveedor documenta precheck para este producto. */
  validationSupported: boolean;
  active: boolean;
  raw?: unknown;
}

export interface ProviderWallet {
  balanceCents: number;
  currency: string;
}

export interface ValidateAccountInput {
  externalId: string;
  kind: ProductKind;
  accountId: string;
}

export interface ValidateAccountResult {
  supported: boolean;
  valid: boolean;
  accountName: string | null;
}

export interface PurchaseInput {
  externalId: string;
  kind: ProductKind;
  /** { input1: "...", input2: "..." } o { redemption_id: "..." } o { quantity: "2" } */
  inputs: Record<string, string>;
  /** Referencia interna nuestra; se envía como `client_name` para trazabilidad. */
  clientReference: string;
}

/** Estado NORMALIZADO. El proveedor puede llamarlo como quiera. */
export type ProviderOrderStatus = "COMPLETED" | "PENDING" | "FAILED" | "UNKNOWN";

export interface PurchaseResult {
  status: ProviderOrderStatus;
  /** `reference` — imprescindible para conciliar una orden PENDING. */
  reference: string | null;
  transactionId: string | null;
  /** Lo que el proveedor cobró, en céntimos de USD. */
  chargedUsdCents: number | null;
  item: string | null;
  pins: string[];
  raw: unknown;
  /** Presente solo cuando status === "FAILED". */
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface OrderStatusResult {
  status: ProviderOrderStatus;
  reference: string | null;
  transactionId: string | null;
  item: string | null;
  pins: string[];
  raw: unknown;
}

export interface ProviderHealth {
  ok: boolean;
  configured: boolean;
  mock: boolean;
  latencyMs: number | null;
  balanceCents: number | null;
  currency: string | null;
  message: string | null;
}

export interface ProviderAdapter {
  readonly code: string;
  readonly name: string;
  readonly baseUrl: string;
  /** false si falta la API key y no estamos en modo simulado. */
  isConfigured(): boolean;

  /** Saldo del REVENDEDOR (nuestro), no el del usuario. Solo panel admin. */
  getWallet(): Promise<ProviderWallet>;
  /** Catálogo completo del proveedor, ya normalizado. */
  listProducts(): Promise<ProviderProduct[]>;
  /** Precheck de cuenta. Devuelve supported=false si el proveedor no lo ofrece. */
  validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult>;
  /** Ejecuta la compra. NO lanza por errores de negocio: los devuelve como FAILED. */
  purchase(input: PurchaseInput, orderId?: string): Promise<PurchaseResult>;
  /** Consulta el estado de una orden previamente PENDING. */
  getOrderStatus(reference: string, orderId?: string): Promise<OrderStatusResult>;
  health(): Promise<ProviderHealth>;
}
