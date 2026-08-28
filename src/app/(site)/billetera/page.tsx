import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, DEPOSIT_STATUS_META, EmptyState, Stat } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { getBalance, listMovements } from "@/server/services/wallet";
import { listUserDeposits } from "@/server/services/deposits";

export const metadata: Metadata = { title: "Mi billetera" };
export const dynamic = "force-dynamic";

const REASON_LABEL: Record<string, string> = {
  DEPOSIT_APPROVED: "Depósito acreditado",
  ORDER_PAYMENT: "Compra de recarga",
  ORDER_REFUND: "Devolución",
  ADMIN_ADJUSTMENT: "Ajuste administrativo",
};

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function WalletPage() {
  const user = await requireUserPage("/billetera");
  const [balance, movements, deposits] = await Promise.all([
    getBalance(user.id),
    listMovements(user.id, 25),
    listUserDeposits(user.id, 10),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Mi billetera</h1>
          <p className="mt-1.5 text-sm text-muted">Tu saldo interno para comprar recargas.</p>
        </div>
        <Link href="/billetera/recargar">
          <Button size="lg">Agregar saldo</Button>
        </Link>
      </div>

      <div className="rise rise-2 mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Saldo disponible" value={formatPEN(balance.balanceCents)} tone="ok" />
        <Stat
          label="En revisión"
          value={formatPEN(balance.pendingCents)}
          sub="Depósitos aún no aprobados"
          tone={balance.pendingCents > 0 ? "warn" : "neutral"}
        />
        <Stat label="Movimientos" value={movements.length} sub="Últimos registrados" />
      </div>

      {/* Solicitudes de depósito */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">Solicitudes de depósito</h2>
        {deposits.length === 0 ? (
          <EmptyState
            title="Todavía no has solicitado ningún depósito"
            description="Carga saldo por Yape y súbenos el comprobante para empezar a comprar."
            action={
              <Link href="/billetera/recargar">
                <Button variant="secondary">Agregar saldo</Button>
              </Link>
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line-soft">
              {deposits.map((d) => {
                const meta = DEPOSIT_STATUS_META[d.status];
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="font-mono text-xs text-faint">{d.code}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {dateFmt.format(d.createdAt)}
                        {d.status === "REJECTED" && d.rejectionReason && ` · ${d.rejectionReason}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold tabular-nums">{formatPEN(d.amountCents)}</span>
                      <a
                        href={`/api/receipts/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-plasma-400 hover:underline"
                      >
                        Ver comprobante
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* Historial de movimientos */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold">Historial de movimientos</h2>
        {movements.length === 0 ? (
          <EmptyState title="Sin movimientos todavía" />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line-soft">
              {movements.map((m) => {
                const credit = m.direction === "CREDIT";
                return (
                  <li key={m.id} className="flex items-center justify-between gap-4 p-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {REASON_LABEL[m.reason] ?? m.reason}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {dateFmt.format(m.createdAt)}
                        {m.description ? ` · ${m.description}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold tabular-nums ${credit ? "text-ok" : "text-ink"}`}
                      >
                        {credit ? "+" : "−"}
                        {formatPEN(m.amountCents)}
                      </p>
                      <p className="text-xs text-faint tabular-nums">
                        Saldo: {formatPEN(m.balanceAfterCents)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
