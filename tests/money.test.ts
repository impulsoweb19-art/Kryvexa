import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSellPriceCents, effectiveMarginBps, formatPEN, toCents } from "@/lib/money";

describe("dinero", () => {
  it("convierte a céntimos sin errores de coma flotante", () => {
    assert.equal(toCents("3.74"), 374);
    assert.equal(toCents(0.1 + 0.2), 30); // 0.30000000000000004 → 30
    assert.equal(toCents("12,50"), 1250); // coma decimal
    assert.equal(toCents(68.4), 6840);
  });

  it("rechaza importes no numéricos", () => {
    assert.throws(() => toCents("abc"));
  });

  it("calcula el precio de venta con tipo de cambio y margen", () => {
    // 3.74 USD × 3.80 × 1.25 = 17.765 → redondea hacia arriba a S/ 17.80
    assert.equal(computeSellPriceCents(374, 3.8, 2500), 1780);
    // Margen 0: 3.74 × 3.80 = 14.212 → 14.30
    assert.equal(computeSellPriceCents(374, 3.8, 0), 1430);
  });

  it("nunca redondea por debajo del margen configurado", () => {
    for (const cost of [100, 374, 1090, 3450, 6840]) {
      const price = computeSellPriceCents(cost, 3.8, 2500);
      assert.ok(price >= cost * 3.8 * 1.25, `precio ${price} por debajo del mínimo para costo ${cost}`);
    }
  });

  it("rechaza un tipo de cambio inválido", () => {
    assert.throws(() => computeSellPriceCents(374, 0, 2500));
    assert.throws(() => computeSellPriceCents(374, -1, 2500));
  });

  it("recupera el margen efectivo", () => {
    const price = computeSellPriceCents(1000, 4, 3000);
    const margin = effectiveMarginBps(price, 1000, 4);
    assert.ok(margin >= 3000, `margen efectivo ${margin} menor al configurado`);
  });

  it("formatea en soles", () => {
    assert.match(formatPEN(1780), /17[.,]80/);
  });
});
