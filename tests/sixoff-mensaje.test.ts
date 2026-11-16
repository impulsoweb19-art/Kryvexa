import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mensajeSaneado } from "@/server/providers/sixoff/mapper";

/**
 * Lo que se protege aquí no es la nota, es la venta.
 *
 * SixoFire solo acepta letras sin tildes, números y espacios, hasta 100
 * caracteres. Si el mensaje no le cuadra responde 400 y **no crea el pedido**:
 * el comprador se queda sin su compra por culpa de un adorno. Y ese texto lo
 * escribe el dueño desde su panel, así que tarde o temprano va a entrar una
 * tilde o un emoji.
 */
describe("mensajeSaneado", () => {
  it("deja intacto el texto que ya cumple", () => {
    assert.equal(mensajeSaneado("Gracias por elegirnos"), "Gracias por elegirnos");
  });

  it("quita las tildes en vez de rechazar el texto", () => {
    assert.equal(mensajeSaneado("Gracias por tu compra Campeón"), "Gracias por tu compra Campeon");
    assert.equal(mensajeSaneado("Feliz día"), "Feliz dia");
  });

  it("limpia signos y emojis, que es lo que su API rechaza", () => {
    assert.equal(mensajeSaneado("¡Gracias por elegirnos!"), "Gracias por elegirnos");
    assert.equal(mensajeSaneado("Gracias 🎉🎁"), "Gracias");
    assert.equal(mensajeSaneado("Kryvexa - tu tienda #1"), "Kryvexa tu tienda 1");
  });

  it("no deja espacios de más al limpiar", () => {
    assert.equal(mensajeSaneado("  Gracias   por    elegirnos  "), "Gracias por elegirnos");
    assert.equal(mensajeSaneado("Gracias!!! ---  por venir"), "Gracias por venir");
  });

  it("respeta el tope de 100 caracteres", () => {
    const largo = mensajeSaneado("a".repeat(150));
    assert.equal(largo?.length, 100);
  });

  /**
   * Null significa "no mandes el campo". Mandar una cadena vacía sería pedirle
   * a su API que valide algo que no hace falta, y entregar sin nota es
   * infinitamente mejor que no entregar.
   */
  it("devuelve null cuando no queda nada que mandar", () => {
    for (const vacio of ["", "   ", "¡¡¡!!!", "🎉", undefined]) {
      assert.equal(mensajeSaneado(vacio), null, JSON.stringify(vacio));
    }
  });
});
