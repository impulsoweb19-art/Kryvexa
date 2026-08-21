import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapBuyGames,
  mapBuyPins,
  mapGameProduct,
  mapPinProduct,
  mapProviderStatus,
  priceToUsdCents,
} from "@/server/providers/recargas-america/mapper";

/**
 * Estas pruebas fijan el contrato con la API documentada. Si el proveedor
 * cambia una forma, aquí es donde debe romperse: no en producción.
 */
describe("mapeo de RecargasAmérica", () => {
  it("traduce los estados del proveedor a los nuestros", () => {
    assert.equal(mapProviderStatus("COMPLETED"), "COMPLETED");
    assert.equal(mapProviderStatus("PENDING"), "PENDING");
    assert.equal(mapProviderStatus("FAILED"), "FAILED");
    assert.equal(mapProviderStatus("completed"), "COMPLETED");
  });

  it("marca como UNKNOWN cualquier estado no reconocido", () => {
    // Es la regla de oro: nunca dar por entregada una recarga que no entendemos.
    assert.equal(mapProviderStatus("ALGO_NUEVO"), "UNKNOWN");
    assert.equal(mapProviderStatus(undefined), "UNKNOWN");
    assert.equal(mapProviderStatus(null), "UNKNOWN");
  });

  it("convierte los precios decimales a céntimos de USD", () => {
    assert.equal(priceToUsdCents(3.74), 374);
    assert.equal(priceToUsdCents("12.50"), 1250);
    assert.throws(() => priceToUsdCents("no-numero"));
  });

  it("mapea un paquete de juego con sus input_fields", () => {
    const product = mapGameProduct({
      id: 1,
      game: "Free Fire (MY)",
      package: "100 Diamonds",
      price: 3.74,
      input_fields: [
        { name: "input1", label: "Player ID" },
        { name: "input2", label: "Server ID" },
      ],
    });

    assert.equal(product.externalId, "1");
    assert.equal(product.kind, "GAME_PACKAGE");
    assert.equal(product.costUsdCents, 374);
    assert.deepEqual(
      product.inputFields.map((f) => f.name),
      ["input1", "input2"],
    );
    // La API NO documenta validación previa para /products/games.
    assert.equal(product.validationSupported, false);
  });

  it("solo habilita la validación en productos type=recharge", () => {
    const recharge = mapPinProduct({ id: 20, name: "Free Fire Recarga", type: "recharge", price: 4.1 });
    const pin = mapPinProduct({ id: 21, name: "Free Fire 1060 Diamonds", type: "pin", price: 12.5 });

    assert.equal(recharge.kind, "RECHARGE");
    assert.equal(recharge.validationSupported, true);
    assert.equal(recharge.inputFields[0].name, "redemption_id");

    assert.equal(pin.kind, "PIN");
    assert.equal(pin.validationSupported, false);
  });

  it("asume type=pin cuando la API omite el campo", () => {
    const product = mapPinProduct({ id: 30, name: "Free Fire 100", price: 3 });
    assert.equal(product.kind, "PIN");
  });

  it("lee la referencia de una compra PENDING", () => {
    const result = mapBuyGames({
      transaction_id: 43,
      reference: "38094W09IPOKW",
      status: "PENDING",
      amount_charged: 3.74,
      item: null,
      pins: [],
    });

    assert.equal(result.status, "PENDING");
    assert.equal(result.reference, "38094W09IPOKW");
    assert.equal(result.chargedUsdCents, 374);
  });

  it("trata /buy/pins sin status como entregado", () => {
    // El endpoint documentado responde sin `status`: success:true = entregado.
    const result = mapBuyPins({ transaction_id: 44, amount_charged: 25.0, api_data: {} });
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.chargedUsdCents, 2500);
  });
});
