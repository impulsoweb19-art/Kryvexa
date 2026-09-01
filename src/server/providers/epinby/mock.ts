import type { RawOrder, RawProduct, RawValidatePlayer } from "./mapper";

/**
 * MODO SIMULADO (`PROVIDER_MOCK=true`). Mismo criterio que
 * `recargas-america/mock.ts`: formas EXACTAS de la documentación
 * (https://epinby.com/docs), solo los valores son de ejemplo.
 */

export const mockWallet = { balance: "500.0000", currency: "USD" };

export const mockProducts: RawProduct[] = [
  {
    id: 501,
    name: "56 Diamantes",
    game_id: 2,
    game: "Mobile Legends",
    category_id: 10,
    category: "Diamantes",
    type: "TOPUP",
    price: "1.1000",
    stock_status: "UNLIMITED",
    stock_count: null,
    fields: [],
    supports_player_validation: true,
  },
  {
    id: 502,
    name: "278 Diamantes",
    game_id: 2,
    game: "Mobile Legends",
    category_id: 10,
    category: "Diamantes",
    type: "TOPUP",
    price: "5.2000",
    stock_status: "UNLIMITED",
    stock_count: null,
    fields: [],
    supports_player_validation: true,
  },
  {
    id: 503,
    name: "570 Diamantes",
    game_id: 2,
    game: "Mobile Legends",
    category_id: 10,
    category: "Diamantes",
    type: "TOPUP",
    price: "10.4000",
    stock_status: "UNLIMITED",
    stock_count: null,
    fields: [],
    supports_player_validation: true,
  },
];

/** Un player_id que empieza por "9" se considera inexistente: sirve para probar el error. */
export function mockValidatePlayer(playerId: string): RawValidatePlayer {
  const notFound = playerId.startsWith("9");
  return {
    nickname: notFound ? "" : `Jugador${playerId.slice(-4)}`,
    player_name: notFound ? "" : `Jugador${playerId.slice(-4)}`,
    region: notFound ? null : "SAC",
    server_id: null,
    nickname_verified: !notFound,
    validation_optional: false,
  };
}

/** Un player_id terminado en "0" produce una orden PENDING (para probar la conciliación/webhook). */
export function mockCreateOrder(productId: string, playerId: string): RawOrder {
  const product = mockProducts.find((p) => String(p.id) === productId);
  const status = playerId.endsWith("0") ? "PENDING" : "COMPLETED";
  return {
    order_id: Date.now(),
    status,
    price: product?.price,
    player: status === "COMPLETED" ? { nickname: `Jugador${playerId.slice(-4)}` } : null,
  };
}

/** Las órdenes simuladas en PENDING se completan a los 30 segundos, igual que RecargasAmérica. */
export function mockOrderStatus(orderId: string): RawOrder {
  const createdAt = Number(orderId);
  if (!Number.isFinite(createdAt)) {
    return { order_id: Number(orderId) || 0, status: "PENDING" };
  }
  const done = Date.now() - createdAt > 30_000;
  return { order_id: createdAt, status: done ? "COMPLETED" : "PENDING" };
}
