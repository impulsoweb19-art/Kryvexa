import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./helpers";
import { getConfig, setConfig } from "@/server/services/settings";

/**
 * Regresión real: un número de WhatsApp formado solo por dígitos
 * ("51999999999") se guardaba como cadena JSON pero volvía del driver
 * convertido en NÚMERO, y `config.supportWhatsapp.replace(...)` tumbaba la
 * página de inicio con un 500. `getConfig` ancla ahora cada tipo al valor por
 * defecto en lugar de fiarse de lo que devuelva la base.
 */
describe("configuración de la tienda", () => {
  it("devuelve cadenas aunque el valor sea todo dígitos", async () => {
    await setConfig({ supportWhatsapp: "51999999999", yapePhone: "999999999" });
    const config = await getConfig();

    assert.equal(typeof config.supportWhatsapp, "string");
    assert.equal(config.supportWhatsapp, "51999999999");
    assert.equal(typeof config.yapePhone, "string");
    // Lo que de verdad rompía:
    assert.doesNotThrow(() => config.supportWhatsapp.replace(/\D/g, ""));
  });

  it("conserva números y booleanos con su tipo", async () => {
    await setConfig({ exchangeRate: 3.95, marginBps: 3000, purchasesEnabled: false });
    const config = await getConfig();

    assert.equal(config.exchangeRate, 3.95);
    assert.equal(config.marginBps, 3000);
    assert.equal(config.purchasesEnabled, false);

    await setConfig({ purchasesEnabled: true });
    assert.equal((await getConfig()).purchasesEnabled, true);
  });

  it("acepta null en el campo que lo admite", async () => {
    await setConfig({ yapeQrPath: null });
    assert.equal((await getConfig()).yapeQrPath, null);
  });

  it("cae al valor por defecto ante un valor corrupto", async () => {
    await setConfig({ exchangeRate: "no-es-un-numero" as unknown as number });
    assert.equal((await getConfig()).exchangeRate, 3.8);
  });
});
