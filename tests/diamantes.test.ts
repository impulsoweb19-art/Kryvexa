import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cuentaParaRanking, diamantesDe } from "@/lib/diamantes";

describe("diamantesDe", () => {
  it("lee los nombres tal y como los manda el proveedor", () => {
    assert.equal(diamantesDe("Recarga Free Fire - 1060 Diamantes"), 1060);
    assert.equal(diamantesDe("110 Diamantes"), 110);
    assert.equal(diamantesDe("Free Fire 5600 diamantes"), 5600);
  });

  it("suma el bono cuando el paquete lo trae aparte", () => {
    assert.equal(diamantesDe("1060 + 106 Diamantes"), 1166);
    assert.equal(diamantesDe("234 + 23 Diamonds"), 257);
  });

  it("ignora los separadores de miles", () => {
    assert.equal(diamantesDe("Recarga Free Fire - 1.060 Diamantes"), 1060);
    assert.equal(diamantesDe("Recarga Free Fire - 1,060 Diamantes"), 1060);
  });

  /**
   * Lo importante no es acertar con los diamantes, es NO inventarlos donde no
   * los hay: un pase contado como diamantes descoloca todo el ranking.
   */
  it("no ve diamantes donde no los hay", () => {
    for (const nombre of [
      "Pase Booyah",
      "Membresía Semanal",
      "Membresía Mensual",
      "20 Cajas Evo",
      "300 Fragmentos Evo",
      "105 Oro",
      "Pase Élite",
      "",
    ]) {
      assert.equal(diamantesDe(nombre), 0, nombre);
    }
  });
});

describe("cuentaParaRanking", () => {
  it("solo cuenta los diamantes de Free Fire", () => {
    assert.equal(cuentaParaRanking("Free Fire", "1060 Diamantes"), true);
    assert.equal(cuentaParaRanking("Free Fire — Entrega manual", "110 Diamantes"), true);
  });

  it("deja fuera los diamantes de otros juegos", () => {
    // Mobile Legends también los llama diamantes y no valen lo mismo.
    assert.equal(cuentaParaRanking("Mobile Legends", "234 + 23 Diamonds"), false);
  });

  it("deja fuera lo que no son diamantes, aunque sea de Free Fire", () => {
    assert.equal(cuentaParaRanking("Free Fire", "Pase Booyah"), false);
    assert.equal(cuentaParaRanking("Blood Strike — Entrega manual", "5800 Oro"), false);
  });
});
