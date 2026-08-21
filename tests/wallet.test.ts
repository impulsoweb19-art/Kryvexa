import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { balanceOf, createTestUser, ledgerOf } from "./helpers";
import { db } from "@/db";
import { applyTransaction, auditIntegrity } from "@/server/services/wallet";
import { isAppError } from "@/lib/errors";

describe("billetera", () => {
  it("acredita y deja asiento contable", async () => {
    const user = await createTestUser(0);

    await db.transaction((tx) =>
      applyTransaction(tx, {
        userId: user.id,
        direction: "CREDIT",
        reason: "DEPOSIT_APPROVED",
        amountCents: 5000,
        idempotencyKey: `test:${user.id}:credit`,
      }),
    );

    assert.equal(await balanceOf(user.id), 5000);
    assert.equal(await ledgerOf(user.id), 5000);
  });

  it("NO duplica el saldo si se repite la misma clave de idempotencia", async () => {
    const user = await createTestUser(0);
    const key = `test:${user.id}:deposit-unico`;

    const apply = () =>
      db.transaction((tx) =>
        applyTransaction(tx, {
          userId: user.id,
          direction: "CREDIT",
          reason: "DEPOSIT_APPROVED",
          amountCents: 2500,
          idempotencyKey: key,
        }),
      );

    const first = await apply();
    const second = await apply();
    const third = await apply();

    assert.equal(first.duplicated, false);
    assert.equal(second.duplicated, true);
    assert.equal(third.duplicated, true);
    assert.equal(await balanceOf(user.id), 2500); // ← una sola vez
    assert.equal(await ledgerOf(user.id), 2500);
  });

  it("rechaza un débito que dejaría la billetera en negativo", async () => {
    const user = await createTestUser(1000);

    await assert.rejects(
      db.transaction((tx) =>
        applyTransaction(tx, {
          userId: user.id,
          direction: "DEBIT",
          reason: "ORDER_PAYMENT",
          amountCents: 1500,
          idempotencyKey: `test:${user.id}:sobregiro`,
        }),
      ),
      (e: unknown) => isAppError(e) && e.code === "INSUFFICIENT_FUNDS",
    );

    assert.equal(await balanceOf(user.id), 1000); // intacto
  });

  it("serializa débitos concurrentes: no se gasta más saldo del que hay", async () => {
    // El escenario clásico de doble clic desde dos pestañas.
    const user = await createTestUser(1000);

    const attempts = Array.from({ length: 5 }, (_, i) =>
      db
        .transaction((tx) =>
          applyTransaction(tx, {
            userId: user.id,
            direction: "DEBIT",
            reason: "ORDER_PAYMENT",
            amountCents: 400,
            idempotencyKey: `test:${user.id}:concurrente-${i}`,
          }),
        )
        .then(() => "ok" as const)
        .catch(() => "rechazado" as const),
    );

    const results = await Promise.all(attempts);
    const okCount = results.filter((r) => r === "ok").length;

    // Con S/ 10.00 y débitos de S/ 4.00 solo pueden pasar dos.
    assert.equal(okCount, 2);
    assert.equal(await balanceOf(user.id), 200);
    assert.equal(await ledgerOf(user.id), 200);
  });

  it("rechaza importes cero o negativos", async () => {
    const user = await createTestUser(1000);
    for (const amount of [0, -100, 1.5]) {
      await assert.rejects(
        db.transaction((tx) =>
          applyTransaction(tx, {
            userId: user.id,
            direction: "CREDIT",
            reason: "ADMIN_ADJUSTMENT",
            amountCents: amount,
            idempotencyKey: `test:${user.id}:invalido-${amount}`,
          }),
        ),
      );
    }
  });

  it("mantiene la invariante contable tras una serie de movimientos", async () => {
    const user = await createTestUser(0);

    const movimientos = [
      { direction: "CREDIT" as const, amount: 10_000, reason: "DEPOSIT_APPROVED" as const },
      { direction: "DEBIT" as const, amount: 1_780, reason: "ORDER_PAYMENT" as const },
      { direction: "DEBIT" as const, amount: 3_450, reason: "ORDER_PAYMENT" as const },
      { direction: "CREDIT" as const, amount: 3_450, reason: "ORDER_REFUND" as const },
      { direction: "DEBIT" as const, amount: 500, reason: "ORDER_PAYMENT" as const },
    ];

    for (const [i, m] of movimientos.entries()) {
      await db.transaction((tx) =>
        applyTransaction(tx, {
          userId: user.id,
          direction: m.direction,
          reason: m.reason,
          amountCents: m.amount,
          idempotencyKey: `test:${user.id}:serie-${i}`,
        }),
      );
    }

    const integrity = await auditIntegrity(user.id);
    assert.equal(integrity.consistent, true);
    assert.equal(integrity.balanceCents, 10_000 - 1_780 - 3_450 + 3_450 - 500);
  });
});
