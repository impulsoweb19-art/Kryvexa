import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cuentaParaRanking, diamantesDelNombre, diamantesRecibidos } from "@/lib/diamantes";

describe("diamantesDelNombre", () => {
  it("lee los nombres tal y como los manda el proveedor", () => {
    assert.equal(diamantesDelNombre("Recarga Free Fire - 1060 Diamantes").cantidad, 1060);
    assert.equal(diamantesDelNombre("110 Diamantes").cantidad, 110);
    assert.equal(diamantesDelNombre("Free Fire 5600 diamantes").cantidad, 5600);
  });

  it("suma el bono cuando el paquete lo trae desglosado", () => {
    const a = diamantesDelNombre("1060 + 106 Diamantes");
    assert.equal(a.cantidad, 1166);
    assert.equal(a.desglosado, true);

    assert.equal(diamantesDelNombre("234 + 23 Diamonds").cantidad, 257);
  });

  it("ignora los separadores de miles", () => {
    assert.equal(diamantesDelNombre("Recarga Free Fire - 1.060 Diamantes").cantidad, 1060);
    assert.equal(diamantesDelNombre("Recarga Free Fire - 1,060 Diamantes").cantidad, 1060);
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
      assert.equal(diamantesDelNombre(nombre).cantidad, 0, nombre);
    }
  });
});

describe("diamantesRecibidos", () => {
  it("agrega el 10% que regala la tienda", () => {
    assert.equal(diamantesRecibidos("110 Diamantes"), 121);
    assert.equal(diamantesRecibidos("Recarga Free Fire - 1060 Diamantes"), 1166);
    assert.equal(diamantesRecibidos("Free Fire 5600 diamantes"), 6160);
  });

  /**
   * El riesgo de este cambio: a un paquete que ya trae el bono escrito en el
   * nombre no se le puede aplicar otra vez, o ese jugador sale inflado.
   */
  it("no vuelve a aplicar el bono si el nombre ya lo trae", () => {
    assert.equal(diamantesRecibidos("1060 + 106 Diamantes"), 1166);
  });

  it("lo que no son diamantes sigue valiendo cero", () => {
    for (const nombre of ["Membresía Mensual", "Pase Booyah", "20 Cajas Evo", "105 Oro"]) {
      assert.equal(diamantesRecibidos(nombre), 0, nombre);
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
