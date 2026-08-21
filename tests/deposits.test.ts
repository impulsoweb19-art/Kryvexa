import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { balanceOf, createTestAdmin, createTestUser, ledgerOf } from "./helpers";
import { approveDeposit, createDeposit, rejectDeposit } from "@/server/services/deposits";
import { isAppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";

let ADMIN: SessionUser;
before(async () => {
  ADMIN = await createTestAdmin();
});

/** PNG mínimo válido: la comprobación del servidor mira los magic bytes. */
function pngFile(name = "comprobante.png") {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.alloc(64, 0x20);
  return new File([Buffer.concat([header, body])], name, { type: "image/png" });
}

function textFile() {
  // Extensión y MIME mentirosos a propósito: el contenido es texto plano.
  return new File([Buffer.from("<script>alert(1)</script>")], "falso.png", { type: "image/png" });
}

describe("depósitos por Yape", () => {
  it("registra la solicitud sin acreditar saldo", async () => {
    const user = await createTestUser(0);

    const deposit = await createDeposit({
      userId: user.id,
      amountCents: 5000,
      operationCode: "0123456",
      file: pngFile(),
    });

    assert.equal(deposit.status, "PENDING");
    assert.equal(await balanceOf(user.id), 0); // aún no se acredita nada
  });

  it("rechaza un archivo que miente sobre su tipo", async () => {
    const user = await createTestUser(0);

    await assert.rejects(
      createDeposit({ userId: user.id, amountCents: 5000, file: textFile() }),
      (e: unknown) => isAppError(e) && e.code === "UPLOAD_INVALID",
    );
  });

  it("acredita el saldo al aprobar", async () => {
    const user = await createTestUser(0);
    const deposit = await createDeposit({ userId: user.id, amountCents: 5000, file: pngFile() });

    const result = await approveDeposit(ADMIN, deposit.id);

    assert.equal(result.deposit.status, "APPROVED");
    assert.equal(result.balanceAfterCents, 5000);
    assert.equal(await balanceOf(user.id), 5000);
    assert.equal(await ledgerOf(user.id), 5000);
  });

  it("NO acredita dos veces el mismo comprobante", async () => {
    const user = await createTestUser(0);
    const deposit = await createDeposit({ userId: user.id, amountCents: 5000, file: pngFile() });

    await approveDeposit(ADMIN, deposit.id);

    // Segundo intento: la transición condicional lo corta.
    await assert.rejects(
      approveDeposit(ADMIN, deposit.id),
      (e: unknown) => isAppError(e) && e.code === "CONFLICT",
    );

    assert.equal(await balanceOf(user.id), 5000); // sigue siendo una sola vez
  });

  it("resiste dos aprobaciones simultáneas del mismo depósito", async () => {
    const user = await createTestUser(0);
    const deposit = await createDeposit({ userId: user.id, amountCents: 7000, file: pngFile() });

    const results = await Promise.allSettled([
      approveDeposit(ADMIN, deposit.id),
      approveDeposit(ADMIN, deposit.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1, "solo una aprobación debe prosperar");
    assert.equal(await balanceOf(user.id), 7000);
    assert.equal(await ledgerOf(user.id), 7000);
  });

  it("al rechazar no mueve saldo y guarda el motivo", async () => {
    const user = await createTestUser(0);
    const deposit = await createDeposit({ userId: user.id, amountCents: 5000, file: pngFile() });

    const rejected = await rejectDeposit(ADMIN, deposit.id, "El monto no coincide con el comprobante");

    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.rejectionReason, "El monto no coincide con el comprobante");
    assert.equal(await balanceOf(user.id), 0);
  });

  it("no se puede aprobar un depósito ya rechazado", async () => {
    const user = await createTestUser(0);
    const deposit = await createDeposit({ userId: user.id, amountCents: 5000, file: pngFile() });

    await rejectDeposit(ADMIN, deposit.id, "Comprobante ilegible");

    await assert.rejects(
      approveDeposit(ADMIN, deposit.id),
      (e: unknown) => isAppError(e) && e.code === "CONFLICT",
    );
    assert.equal(await balanceOf(user.id), 0);
  });
});
