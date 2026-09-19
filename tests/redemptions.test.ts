import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, redemptionCodes } from "@/db/schema";
import { createTestAdmin, createTestUser } from "./helpers";
import { generateCodes, normalizeCode, redeemCode } from "@/server/services/redemptions";
import { isAppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";

let ADMIN: SessionUser;
before(async () => {
  ADMIN = await createTestAdmin();
});

describe("códigos de canje", () => {
  it("genera códigos únicos con el formato acordado", async () => {
    const codes = await generateCodes(ADMIN, { prize: "100 diamantes", count: 5 });

    assert.equal(codes.length, 5);
    for (const c of codes) assert.match(c.code, /^KRYV-[A-Z0-9]{5}$/);
    assert.equal(new Set(codes.map((c) => c.code)).size, 5, "no puede repetir códigos");
  });

  it("canjear deja el premio esperando entrega manual, sin cobrar nada", async () => {
    const user = await createTestUser(0);
    const [code] = await generateCodes(ADMIN, { prize: "Pase Booyah", count: 1 });

    const { orderCode } = await redeemCode(user, code.code, "123456789");

    const [order] = await db.select().from(orders).where(eq(orders.code, orderCode)).limit(1);
    assert.equal(order.status, "PENDING");
    assert.equal(order.providerCode, "manual");
    assert.equal(order.productName, "Pase Booyah");
    assert.equal(order.priceCents, 0, "un premio no se cobra");
    assert.equal(order.productId, null, "no sale del catálogo");
  });

  it("un código solo lo puede canjear UNA persona", async () => {
    const primero = await createTestUser(0);
    const segundo = await createTestUser(0);
    const [code] = await generateCodes(ADMIN, { prize: "100 diamantes", count: 1 });

    await redeemCode(primero, code.code, "111111111");

    await assert.rejects(
      redeemCode(segundo, code.code, "222222222"),
      (e: unknown) => isAppError(e) && e.code === "CONFLICT",
    );
  });

  it("dos canjes simultáneos del mismo código: solo uno gana", async () => {
    // Es EL requisito del cliente: diez personas pegando el código a la vez.
    // Leer y luego escribir no bastaría; por eso el reclamo es una sola
    // instrucción condicional.
    const a = await createTestUser(0);
    const b = await createTestUser(0);
    const [code] = await generateCodes(ADMIN, { prize: "500 diamantes", count: 1 });

    const results = await Promise.allSettled([
      redeemCode(a, code.code, "111111111"),
      redeemCode(b, code.code, "222222222"),
    ]);

    const ganaron = results.filter((r) => r.status === "fulfilled");
    assert.equal(ganaron.length, 1, "exactamente uno debe llevarse el premio");

    // Y solo existe un pedido por ese código.
    const creados = await db
      .select()
      .from(orders)
      .where(eq(orders.externalId, `canje-${code.code}`));
    assert.equal(creados.length, 1);
  });

  it("rechaza un código que no existe", async () => {
    const user = await createTestUser(0);

    await assert.rejects(
      redeemCode(user, "KRYV-ZZZZZ", "123456789"),
      (e: unknown) => isAppError(e) && e.code === "CONFLICT",
    );
  });

  it("acepta el código aunque lo escriban en minúsculas o sin guion", async () => {
    assert.equal(normalizeCode("kryv-7x92q"), "KRYV-7X92Q");
    assert.equal(normalizeCode("KRYV7X92Q"), "KRYV-7X92Q");
    assert.equal(normalizeCode("  kryv 7x92q "), "KRYV-7X92Q");

    const user = await createTestUser(0);
    const [code] = await generateCodes(ADMIN, { prize: "Membresía", count: 1 });
    const sinGuion = code.code.replace("-", "").toLowerCase();

    const { orderCode } = await redeemCode(user, sinGuion, "123456789");
    assert.ok(orderCode);
  });

  it("el código canjeado queda ligado a quien lo usó y a su pedido", async () => {
    const user = await createTestUser(0);
    const [code] = await generateCodes(ADMIN, { prize: "Tarjeta semanal", count: 1 });

    await redeemCode(user, code.code, "123456789");

    const [row] = await db
      .select()
      .from(redemptionCodes)
      .where(eq(redemptionCodes.id, code.id))
      .limit(1);

    assert.ok(row.redeemedAt, "debe quedar marcado como canjeado");
    assert.equal(row.redeemedById, user.id);
    assert.ok(row.orderId, "debe apuntar al pedido del premio");
  });
});
