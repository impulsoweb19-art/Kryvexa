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
import { ProviderRequestError } from "../types";
import { PROVIDER_CODE, baseUrl, isConfigured, request } from "./client";
import {
  type RawItem,
  type RawOrder,
  aceptaMensaje,
  estadoNormalizado,
  mapItem,
  partirExternalId,
  usdACentimos,
} from "./mapper";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Lo que se escribe en el buzón del juego junto al artículo entregado. */
const MENSAJE_REGALO = "Gracias por elegirnos";

/** Su API lo limita a 100 caracteres y solo letras, números y espacios. */
const MAX_MENSAJE = 100;

/**
 * El UID destino que acepta SixoFire es de 8 a 12 dígitos, no de 8 a 15 como
 * admite nuestro formulario. Se comprueba ANTES de cobrar: sin esto, a un
 * comprador con un ID de 13 dígitos se le cobraría y el pedido reventaría del
 * lado de ellos, dejando una devolución que hacer a mano.
 */
const UID_VALIDO = /^[0-9]{8,12}$/;

/**
 * Catálogo cacheado en memoria.
 *
 * `GET /account/shop/items` NO consume cuota —lo dice su documentación—, así
 * que se puede consultar con libertad; esto es solo para no añadir un viaje de
 * red a cada compra. Se usa para saber si un artículo admite el mensaje de
 * regalo, que es un dato por artículo y no se puede adivinar.
 */
const CACHE_MS = 5 * 60_000;
let cacheItems: { expira: number; porId: Map<string, RawItem> } | null = null;

/**
 * Dónde quiere SixoFire avisarnos de los cambios de un pedido.
 *
 * Devuelve null si `APP_URL` no es https o apunta a localhost, que es el caso
 * en desarrollo. No es un capricho: su API responde 400 `INVALID_WEBHOOK_URL`
 * y NO crea el pedido, así que mandar un localhost rompería la compra entera
 * en vez de quedarse sin aviso.
 */
function urlDeAviso(): string | null {
  const base = env().APP_URL.trim().replace(/\/+$/, "");
  if (!base.startsWith("https://")) return null;
  if (/\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(base)) return null;
  return `${base}/api/webhooks/sixoff`;
}

async function itemsPorId(): Promise<Map<string, RawItem>> {
  if (cacheItems && cacheItems.expira > Date.now()) return cacheItems.porId;

  const data = await request<{ items?: RawItem[] }>({
    operation: "shop.items",
    method: "GET",
    path: "/account/shop/items",
  });

  const porId = new Map<string, RawItem>();
  for (const item of data.items ?? []) {
    if (item.id) porId.set(String(item.id), item);
  }
  cacheItems = { expira: Date.now() + CACHE_MS, porId };
  return porId;
}

class SixoFireShopService implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  readonly name = "SixoFire";

  get baseUrl(): string {
    return baseUrl();
  }

  isConfigured(): boolean {
    return isConfigured();
  }

  /**
   * SixoFire NO publica un endpoint de saldo.
   *
   * Lo único que lo revela es `walletTransaction.newBalance`, que viene dentro
   * de la respuesta de cada pedido creado. Devolver cero aquí haría que el
   * panel mostrara "saldo 0" y el dueño saldría corriendo a recargar sin
   * necesidad, así que se dice la verdad: no se puede consultar.
   */
  async getWallet(): Promise<ProviderWallet> {
    throw new ProviderRequestError(
      "BUSINESS",
      "SixoFire no expone el saldo; se conoce al crear un pedido",
      null,
      "WALLET_NOT_SUPPORTED",
    );
  }

  // ── GET /account/shop/items — catálogo de venta ───────────────────────────
  async listProducts(): Promise<ProviderProduct[]> {
    const data = await request<{ items?: RawItem[] }>({
      operation: "shop.items",
      method: "GET",
      path: "/account/shop/items",
    });
    return (data.items ?? []).map(mapItem);
  }

  // ── GET /account/info — comprobar al jugador antes de cobrar ──────────────
  async validateAccount(input: ValidateAccountInput): Promise<ValidateAccountResult> {
    if (!UID_VALIDO.test(input.accountId)) {
      return {
        supported: true,
        valid: false,
        accountName: null,
        reason: "El ID de jugador debe tener entre 8 y 12 dígitos.",
      };
    }

    try {
      const data = await request<{
        basicInfo?: { accountId?: string; nickname?: string | null; level?: number };
      }>({
        operation: "account.info",
        method: "GET",
        path: `/account/info?uid=${encodeURIComponent(input.accountId)}`,
      });

      const info = data.basicInfo;
      if (!info?.accountId) {
        return { supported: true, valid: false, accountName: null, reason: null };
      }
      return { supported: true, valid: true, accountName: info.nickname ?? null };
    } catch (e) {
      // `ACCOUNT_NOT_FOUND` (404) es la ÚNICA respuesta suya que significa de
      // verdad "ese ID no existe". Cualquier otro fallo es "no pudimos
      // preguntar", y ahí no se acusa al comprador de equivocarse.
      if (e instanceof ProviderRequestError && e.providerCode === "ACCOUNT_NOT_FOUND") {
        return {
          supported: true,
          valid: false,
          accountName: null,
          reason: "No encontramos ninguna cuenta de Free Fire con ese ID.",
        };
      }
      return { supported: false, valid: false, accountName: null };
    }
  }

  /**
   * POST /account/shop/order
   *
   * El cobro sale del monedero GENERAL en dólares del panel del dueño. Nada de
   * JWT ni de diamantes: eso es el otro endpoint, el de regalos, y no se usa.
   */
  async purchase(input: PurchaseInput, orderId?: string): Promise<PurchaseResult> {
    const { productId, cantidad } = partirExternalId(input.externalId);
    const uid = (input.inputs.input1 ?? "").trim();

    /*
      Se corta aquí, antes de salir a la red. Nuestro formulario admite IDs de
      hasta 15 dígitos y SixoFire solo acepta de 8 a 12: sin esta comprobación
      el pedido se crearía contra ellos, respondería 400 y habría que deshacer
      un cobro a mano. Es BUSINESS y no NETWORK a propósito —sabemos con
      certeza que no se ejecutó nada del otro lado—, para que `orders.ts` pueda
      devolver el dinero sin dudarlo.
    */
    if (!UID_VALIDO.test(uid)) {
      throw new ProviderRequestError(
        "BUSINESS",
        "El ID de jugador debe tener entre 8 y 12 dígitos",
        null,
        "INVALID_UID",
      );
    }

    const body: Record<string, unknown> = { uid, product_id: productId, amount: cantidad };

    /*
      Con esto SixoFire nos avisa en cuanto el pedido cambia, en vez de que lo
      descubramos en la siguiente pasada del cron. Importa aquí más que con
      otros proveedores: sus entregas pueden quedarse encoladas horas, y el
      cron no corre de madrugada.
      Solo se manda si la URL es pública y https; su API rechaza el pedido
      entero con `INVALID_WEBHOOK_URL` si apunta a localhost o a una red
      privada, así que en desarrollo simplemente no se envía.
    */
    const aviso = urlDeAviso();
    if (aviso) body.webhook_url = aviso;

    /*
      El mensaje SOLO se manda si el artículo es de tipo GIFT: en cualquier
      otro su API responde 400 MESSAGE_NOT_APPLICABLE y el pedido NO se crea.

      Y si no se puede averiguar el tipo, se omite. Perder la nota de
      agradecimiento no le cuesta nada a nadie; perder la venta por adornarla,
      sí.
    */
    try {
      const item = (await itemsPorId()).get(productId);
      if (aceptaMensaje(item)) body.message = MENSAJE_REGALO.slice(0, MAX_MENSAJE);
    } catch {
      logger.warn("No se pudo leer el catálogo de SixoFire: se omite el mensaje de regalo", {
        productId,
      });
    }

    const raw = await request<RawOrder>({
      operation: "shop.order.create",
      method: "POST",
      path: "/account/shop/order",
      body,
      orderId,
    });

    /*
      Su saldo restante viaja aquí y en ningún otro sitio, así que se anota en
      cuanto pasa. Es la única forma de que el dueño se entere de que se está
      quedando sin fondos antes de que un pedido falle por 402.
    */
    if (typeof raw.walletTransaction?.newBalance === "number") {
      logger.info("Saldo restante en SixoFire", {
        saldoUsd: raw.walletTransaction.newBalance,
        pedido: raw.id ?? null,
      });
    }

    return {
      status: estadoNormalizado(raw.status),
      reference: raw.id !== undefined ? String(raw.id) : null,
      transactionId: raw.id !== undefined ? String(raw.id) : null,
      chargedUsdCents: usdACentimos(raw.totalPriceUsd),
      item: raw.itemName ?? null,
      pins: [],
      raw,
    };
  }

  // ── GET /account/shop/orders/{id} — conciliación ──────────────────────────
  //
  // No consume cuota, así que se puede preguntar tantas veces como haga falta.
  // Y falta: sus entregas van de instantáneas a 48 horas, porque cuando no hay
  // stock el pedido queda encolado hasta que repongan.
  async getOrderStatus(reference: string, orderId?: string): Promise<OrderStatusResult> {
    const raw = await request<RawOrder>({
      operation: "shop.order.get",
      method: "GET",
      path: `/account/shop/orders/${encodeURIComponent(reference)}`,
      orderId,
      timeoutMs: 15_000,
    });

    return {
      status: estadoNormalizado(raw.status),
      reference: raw.id !== undefined ? String(raw.id) : reference,
      transactionId: raw.id !== undefined ? String(raw.id) : null,
      item: raw.itemName ?? null,
      pins: [],
      raw,
    };
  }

  /**
   * Diagnóstico para el panel admin.
   *
   * Se apoya en el catálogo y no en el saldo —que no se puede consultar— y de
   * paso no gasta cuota, así que el admin puede refrescar esta pantalla las
   * veces que quiera sin coste.
   */
  async health(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        configured: false,
        mock: false,
        latencyMs: null,
        balanceCents: null,
        currency: null,
        message: "Falta SIXOFF_API_KEY en el entorno del servidor.",
      };
    }

    const startedAt = Date.now();
    try {
      const items = await this.listProducts();
      return {
        ok: true,
        configured: true,
        mock: false,
        latencyMs: Date.now() - startedAt,
        balanceCents: null,
        currency: "USD",
        message: `${items.filter((p) => p.active).length} artículos disponibles.`,
      };
    } catch (e) {
      const err = e as ProviderRequestError;
      return {
        ok: false,
        configured: true,
        mock: false,
        latencyMs: Date.now() - startedAt,
        balanceCents: null,
        currency: null,
        message: err.providerCode
          ? `SixoFire rechazó la consulta (${err.providerCode}).`
          : "Fallo de conexión con SixoFire.",
      };
    }
  }
}

export const sixoff = new SixoFireShopService();
export { PROVIDER_CODE };
