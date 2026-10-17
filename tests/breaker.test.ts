import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { esCaidaDelProveedor } from "@/server/services/breaker";
import { ProviderRequestError } from "@/server/providers/types";

/**
 * La clasificación es la decisión arriesgada de todo el fusible.
 *
 * Si se cuenta de más, la tienda deja de vender porque tres personas
 * escribieron mal su ID de jugador. Si se cuenta de menos, el fusible no salta
 * nunca y los pedidos se siguen acumulando en revisión, que es justo lo que
 * vino a evitar.
 */
describe("esCaidaDelProveedor", () => {
  it("cuenta lo que significa que el proveedor no contesta", () => {
    for (const kind of ["NETWORK", "TIMEOUT", "MALFORMED"] as const) {
      assert.equal(esCaidaDelProveedor(new ProviderRequestError(kind, "sin respuesta")), true, kind);
    }
  });

  it("cuenta los 5xx: contestó, pero para decir que se cayó", () => {
    assert.equal(esCaidaDelProveedor(new ProviderRequestError("HTTP", "boom", 500)), true);
    assert.equal(esCaidaDelProveedor(new ProviderRequestError("HTTP", "gateway", 502)), true);
    assert.equal(esCaidaDelProveedor(new ProviderRequestError("HTTP", "saturado", 503)), true);
  });

  it("NO cuenta los errores de negocio, que son el proveedor funcionando", () => {
    // El caso real del 26/09/2026: cuatro pedidos rechazados por región.
    assert.equal(
      esCaidaDelProveedor(new ProviderRequestError("BUSINESS", "region mismatch", 422, "REGION_MISMATCH")),
      false,
    );
    assert.equal(
      esCaidaDelProveedor(new ProviderRequestError("HTTP", "no autorizado", 401)),
      false,
    );
    assert.equal(
      esCaidaDelProveedor(new ProviderRequestError("HTTP", "no encontrado", 404)),
      false,
    );
  });

  it("no se traga cualquier excepción que pase por ahí", () => {
    assert.equal(esCaidaDelProveedor(new Error("un bug nuestro")), false);
    assert.equal(esCaidaDelProveedor(null), false);
    assert.equal(esCaidaDelProveedor("algo"), false);
  });
});
