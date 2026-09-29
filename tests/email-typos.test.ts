import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sugerirCorreo } from "@/lib/email-typos";

describe("sugerirCorreo", () => {
  it("corrige el caso real que costó una cuenta: @gmil.com", () => {
    assert.equal(sugerirCorreo("juan@gmil.com"), "juan@gmail.com");
  });

  it("corrige erratas habituales del dominio y de la terminación", () => {
    const casos: Array<[string, string]> = [
      ["ana@gmial.com", "ana@gmail.com"],
      ["ana@gmail.con", "ana@gmail.com"],
      ["ana@gmail.co", "ana@gmail.com"],
      ["ana@hotmial.com", "ana@hotmail.com"],
      ["ana@hotmai.com", "ana@hotmail.com"],
      ["ana@outlok.com", "ana@outlook.com"],
      ["ana@yaho.com", "ana@yahoo.com"],
    ];
    for (const [entrada, esperado] of casos) {
      assert.equal(sugerirCorreo(entrada), esperado, entrada);
    }
  });

  it("no toca los correos que ya están bien", () => {
    for (const bueno of [
      "ana@gmail.com",
      "ana@hotmail.com",
      "ana@outlook.es",
      "ana@icloud.com",
      "ana@proton.me",
    ]) {
      assert.equal(sugerirCorreo(bueno), null, bueno);
    }
  });

  /**
   * El riesgo de esta función no es fallar en corregir, es corregir de más:
   * decirle a alguien con un correo válido que se equivocó. Estos dominios son
   * reales y están a una o dos letras de los populares.
   */
  it("respeta dominios reales parecidos a los populares", () => {
    for (const real of ["ana@ymail.com", "ana@mail.com", "ana@me.com", "ana@live.com"]) {
      assert.equal(sugerirCorreo(real), null, real);
    }
  });

  it("no opina sobre dominios propios ni de empresa", () => {
    for (const propio of [
      "contacto@kryvexa.net",
      "ana@miempresa.com.pe",
      "soporte@recargasamerica.com",
    ]) {
      assert.equal(sugerirCorreo(propio), null, propio);
    }
  });

  it("guarda silencio mientras el correo está a medio escribir", () => {
    for (const parcial of ["", "ana", "ana@", "@gmail.com", "ana@gmail", "ana @gmail.com"]) {
      assert.equal(sugerirCorreo(parcial), null, JSON.stringify(parcial));
    }
  });

  it("conserva la parte de antes del arroba tal cual", () => {
    assert.equal(sugerirCorreo("  Jose.Perez+tienda@GMIL.COM  "), "jose.perez+tienda@gmail.com");
  });
});
