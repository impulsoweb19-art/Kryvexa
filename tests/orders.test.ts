import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { balanceOf, createTestProduct, createTestUser, ledgerOf } from "./helpers";
import { createOrder, refundOrder } from "@/server/services/orders";
import { isAppError } from "@/lib/errors";
import { randomUUID } from "node:crypto";

/**
 * Pruebas del motor de compra con el proveedor en modo simulado.
 *
 * Convención del mock (ver mock.ts): un Player ID terminado en "0" devuelve
 * PENDING; el resto se completan al instante.
 */
describe("motor de órdenes", () => {
  it("cobra el saldo y completa la orden", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    const { order } = await createOrder({
      user,
      productId: product.id,
      inputs: { input1: "123456789", input2: "3001" },
      expectedPriceCents: 1780,
      idempotencyKey: randomUUID(),
    });

    assert.equal(order.status, "COMPLETED");
    assert.equal(await balanceOf(user.id), 5000 - 1780);
    assert.equal(await ledgerOf(user.id), 5000 - 1780);
  });

  it("el doble clic con la misma clave crea UNA sola orden y cobra UNA vez", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();
    const key = randomUUID();

    const payload = {
      user,
      productId: product.id,
      inputs: { input1: "123456789", input2: "3001" },
      expectedPriceCents: 1780,
      idempotencyKey: key,
    };

    const first = await createOrder(payload);
    const second = await createOrder(payload);

    assert.equal(first.duplicated, false);
    assert.equal(second.duplicated, true);
    assert.equal(first.order.id, second.order.id);
    assert.equal(await balanceOf(user.id), 5000 - 1780); // un solo cobro
  });

  it("dos peticiones simultáneas con la misma clave tampoco duplican el cobro", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();
    const key = randomUUID();
    const payload = {
      user,
      productId: product.id,
      inputs: { input1: "123456789", input2: "3001" },
      expectedPriceCents: 1780,
      idempotencyKey: key,
    };

    const results = await Promise.allSettled([createOrder(payload), createOrder(payload)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    // Puede que una de las dos falle por conflicto, pero nunca se cobra dos veces.
    assert.ok(fulfilled.length >= 1);
    assert.equal(await balanceOf(user.id), 5000 - 1780);
  });

  it("no permite comprar sin saldo suficiente y no crea la orden", async () => {
    const user = await createTestUser(500);
    const product = await createTestProduct();

    await assert.rejects(
      createOrder({
        user,
        productId: product.id,
        inputs: { input1: "123456789", input2: "3001" },
        expectedPriceCents: 1780,
        idempotencyKey: randomUUID(),
      }),
      (e: unknown) => isAppError(e) && e.code === "INSUFFICIENT_FUNDS",
    );

    // Ni el saldo ni el libro mayor se movieron: no se apuntó ningún débito.
    assert.equal(await balanceOf(user.id), 500);
    assert.equal(await ledgerOf(user.id), 500);
  });

  it("rechaza un precio manipulado desde el cliente", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    await assert.rejects(
      createOrder({
        user,
        productId: product.id,
        inputs: { input1: "123456789", input2: "3001" },
        expectedPriceCents: 1, // "un céntimo, por favor"
        idempotencyKey: randomUUID(),
      }),
      (e: unknown) => isAppError(e) && e.code === "PRICE_CHANGED",
    );

    assert.equal(await balanceOf(user.id), 5000);
  });

  it("exige todos los input_fields declarados por la API", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    await assert.rejects(
      createOrder({
        user,
        productId: product.id,
        inputs: { input1: "123456789" }, // falta input2 (Server ID)
        expectedPriceCents: 1780,
        idempotencyKey: randomUUID(),
      }),
      (e: unknown) => isAppError(e) && e.code === "VALIDATION_ERROR",
    );

    assert.equal(await balanceOf(user.id), 5000);
  });

  it("rechaza campos que el producto no declara", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    await assert.rejects(
      createOrder({
        user,
        productId: product.id,
        inputs: { input1: "123456789", input2: "3001", input9: "inyectado" },
        expectedPriceCents: 1780,
        idempotencyKey: randomUUID(),
      }),
      (e: unknown) => isAppError(e) && e.code === "VALIDATION_ERROR",
    );
  });

  it("deja la orden PENDING cuando el proveedor no confirma la entrega", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    const { order } = await createOrder({
      user,
      productId: product.id,
      inputs: { input1: "123456780", input2: "3001" }, // termina en 0 → PENDING
      expectedPriceCents: 1780,
      idempotencyKey: randomUUID(),
    });

    assert.equal(order.status, "PENDING");
    assert.ok(order.providerReference, "una orden pendiente debe guardar la referencia");
    // El saldo sigue descontado: NO se reembolsa a ciegas algo que quizá se entregó.
    assert.equal(await balanceOf(user.id), 5000 - 1780);
  });

  it("el reembolso es idempotente: nunca devuelve el saldo dos veces", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct();

    const { order } = await createOrder({
      user,
      productId: product.id,
      inputs: { input1: "123456789", input2: "3001" },
      expectedPriceCents: 1780,
      idempotencyKey: randomUUID(),
    });

    await refundOrder(order.id, "prueba");
    await refundOrder(order.id, "prueba repetida");
    await refundOrder(order.id, "y otra vez");

    assert.equal(await balanceOf(user.id), 5000); // devuelto una sola vez
    assert.equal(await ledgerOf(user.id), 5000);
  });

  it("no vende productos ocultos", async () => {
    const user = await createTestUser(5000);
    const product = await createTestProduct({ visible: false });

    await assert.rejects(
      createOrder({
        user,
        productId: product.id,
        inputs: { input1: "123456789", input2: "3001" },
        expectedPriceCents: 1780,
        idempotencyKey: randomUUID(),
      }),
      (e: unknown) => isAppError(e) && e.code === "PRODUCT_UNAVAILABLE",
    );
  });
});
