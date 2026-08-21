import "server-only";

import type {
  OrderStatusResult,
  ProviderAdapter,
  ProviderHealth,
  ProviderProduct,
  ProviderWallet,
  PurchaseInput,
  PurchaseResult,
  ValidateAccountInput,
  ValidateAccountResult,
} from "../types";

export const PROVIDER_CODE = "manual";

/**
 * Proveedor "manual".
 *
 * No llama a ninguna API externa: existe para productos que el propio
 * administrador entrega a mano por fuera de la plataforma (por ejemplo, un
 * Pase Booyah o una membresía que el dueño del negocio activa él mismo
 * dentro del juego, en vez de comprarse automáticamente en RecargasAmérica).
 *
 * `purchase()` jamás "compra" nada: se limita a devolver PENDING para que la
 * orden quede esperando en el panel. El administrador la marca como
 * "Entregado" desde /admin/pedidos (ver `adminResolveOrder` en
 * server/services/orders.ts) una vez que de verdad hizo la recarga a mano;
 * ese mismo mecanismo ya existe para las órdenes normales, así que no hace
 * falta nada más.
 */
class ManualProviderService implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  readonly name = "Entrega manual";
  readonly baseUrl = "";

  isConfigured(): boolean {
    // No requiere credenciales: nunca habla con un servidor externo.
    return true;
  }

  async getWallet(): Promise<ProviderWallet> {
    return { balanceCents: 0, currency: "USD" };
  }

  async listProducts(): Promise<ProviderProduct[]> {
    // No hay catálogo que sincronizar: estos productos se crean una sola vez
    // (ver src/db/seed.ts) y el administrador ajusta precio/visibilidad a
    // mano desde Catálogo, igual que con cualquier otro producto.
    return [];
  }

  async validateAccount(_input: ValidateAccountInput): Promise<ValidateAccountResult> {
    return { supported: false, valid: true, accountName: null };
  }

  async purchase(_input: PurchaseInput): Promise<PurchaseResult> {
    return {
      status: "PENDING",
      reference: null,
      transactionId: null,
      chargedUsdCents: null,
      item: null,
      pins: [],
      raw: { manual: true },
    };
  }

  async getOrderStatus(): Promise<OrderStatusResult> {
    // Nadie concilia esto automáticamente: sin `reference`, la conciliación
    // periódica la deja en espera y, si nadie la atiende, acaba pasando a
    // "Requiere revisión" para que no se olvide (ver reconcilePendingOrders).
    return {
      status: "PENDING",
      reference: null,
      transactionId: null,
      item: null,
      pins: [],
      raw: { manual: true },
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      configured: true,
      mock: false,
      latencyMs: 0,
      balanceCents: null,
      currency: null,
      message: "Entrega manual: no depende de ninguna API externa.",
    };
  }
}

export const manualProvider = new ManualProviderService();
