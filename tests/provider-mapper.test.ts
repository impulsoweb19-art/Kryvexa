import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapBuyCatalog,
  mapCatalogProduct,
  mapProviderStatus,
  priceToUsdCents,
} from "@/server/providers/recargas-america/mapper";

/**
 * Estas pruebas fijan el contrato con la API documentada. Si el proveedor
 * cambia una forma, aquí es donde debe romperse: no en producción.
 *
 * Desde el 2026-09-20 el proveedor sirve todo por el catálogo unificado
 * (/products/catalog + /buy/catalog); los endpoints por tipo de producto
 * quedaron apagados.
 */
describe("mapeo de RecargasAmérica", () => {
  it("traduce los estados del proveedor a los nuestros", () => {
    assert.equal(mapProviderStatus("COMPLETED"), "COMPLETED");
    assert.equal(mapProviderStatus("PENDING"), "PENDING");
    assert.equal(mapProviderStatus("FAILED"), "FAILED");
    assert.equal(mapProviderStatus("completed"), "COMPLETED");
  });

  it("trata PROCESSING_PROVIDER como una orden todavía viva", () => {
    // Lo devuelve el catálogo unificado cuando el proveedor que gana la compra
    // es asíncrono. Darlo por fallido reembolsaría una recarga que sí va a salir.
    assert.equal(mapProviderStatus("PROCESSING_PROVIDER"), "PENDING");
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

  it("mapea un producto del catálogo conservando los nombres canónicos", () => {
    const product = mapCatalogProduct({
      id: 1,
      sku: "MP-FF100",
      name: "Free Fire 100 Diamantes",
      type: "recharge",
      price: 1.15,
      required_fields: ["player_id"],
    });

    assert.equal(product.externalId, "1");
    assert.equal(product.sku, "MP-FF100");
    assert.equal(product.kind, "RECHARGE");
    assert.equal(product.costUsdCents, 115);
    assert.equal(product.gameName, "Free Fire");
    assert.equal(product.validationSupported, true);

    // El nombre del campo viaja tal cual a /buy/catalog: si se tradujera a
    // "input1", el proveedor no sabría qué es.
    assert.deepEqual(
      product.inputFields.map((f) => f.name),
      ["player_id"],
    );
    assert.equal(product.inputFields[0].label, "ID de jugador");
  });

  it("mapea varios campos requeridos en el orden que los declara la API", () => {
    const product = mapCatalogProduct({
      id: 2,
      name: "Mobile Legends 100 Diamantes",
      type: "recharge",
      price: 1.5,
      required_fields: ["player_id", "zone_id"],
    });

    assert.deepEqual(
      product.inputFields.map((f) => f.name),
      ["player_id", "zone_id"],
    );
  });

  it("un PIN sin campos requeridos se compra por cantidad", () => {
    const product = mapCatalogProduct({ id: 3, name: "Free Fire 1060", type: "pin", price: 12.5 });

    assert.equal(product.kind, "PIN");
    assert.equal(product.validationSupported, false);
    assert.equal(product.inputFields[0].name, "quantity");
  });

  it("asume recarga cuando la API omite el tipo", () => {
    const product = mapCatalogProduct({ id: 4, name: "Free Fire 100", price: 3 });
    assert.equal(product.kind, "RECHARGE");
  });

  it("guarda el order_id de la compra como referencia para conciliar", () => {
    const result = mapBuyCatalog({
      transaction_id: 50,
      order_id: "RAAPI-MP-50-9F2A",
      status: "PROCESSING_PROVIDER",
      amount_charged: 1.15,
      item: null,
    });

    assert.equal(result.status, "PENDING");
    // El catálogo llama `order_id` a lo que antes era `reference`.
    assert.equal(result.reference, "RAAPI-MP-50-9F2A");
    assert.equal(result.chargedUsdCents, 115);
  });
});
