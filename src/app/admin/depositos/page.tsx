import Link from "next/link";
import { Badge, Card, DEPOSIT_STATUS_META, EmptyState, cx } from "@/components/ui";
import { DepositActions } from "@/components/admin/DepositActions";
import { formatPEN } from "@/lib/money";
import { listDepositsForAdmin } from "@/server/services/deposits";
import type { DepositStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: DepositStatus | "ALL"; label: string }> = [
  { value: "PENDING", label: "Pendientes" },
  { value: "APPROVED", label: "Aprobados" },
  { value: "REJECTED", label: "Rechazados" },
  { value: "ALL", label: "Todos" },
];

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function AdminDepositsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "PENDING") as DepositStatus | "ALL";

  const { rows, total } = await listDepositsForAdmin({
    status: status === "ALL" ? undefined : status,
    search: sp.q,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Depósitos</h1>
        <p className="mt-1 text-sm text-muted">
          Verifica el comprobante contra tu app de Yape antes de aprobar. Al aprobar, el saldo se
          acredita de inmediato.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/depositos?status=${f.value}`}
            className={cx(
              "rounded-lg border px-3.5 py-2 text-sm transition-colors",
              status === f.value
                ? "border-flame-500 bg-flame-500/10 text-flame-400"
                : "border-line bg-abyss text-muted hover:text-ink",
            )}
          >
            {f.label}
          </Link>
        ))}
        <span className="ml-auto text-sm text-faint">{total} resultado(s)</span>
      </div>

      <form className="flex gap-2" action="/admin/depositos">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por código, correo o nombre…"
          className="w-full rounded-xl border border-line bg-abyss px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-flame-500/70 focus:outline-none"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No hay solicitudes con este filtro" />
      ) : (
        <div className="space-y-3">
          {rows.map(({ deposit, user }) => {
            const meta = DEPOSIT_STATUS_META[deposit.status];
            return (
              <Card key={deposit.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-faint">{deposit.code}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {deposit.operationCode && (
                        <span className="text-xs text-muted">Op. {deposit.operationCode}</span>
                      )}
                    </div>

                    <p className="mt-2 font-semibold">{user.name}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                    <p className="mt-1 text-xs text-faint">{dateFmt.format(deposit.createdAt)}</p>

                    {deposit.status === "REJECTED" && deposit.rejectionReason && (
                      <p className="mt-2 text-xs text-danger">Motivo: {deposit.rejectionReason}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-xs text-faint">Monto</p>
                      <p className="text-xl font-black tabular-nums">
                        {formatPEN(deposit.amountCents)}
                      </p>
                    </div>
                    <a
                      href={`/api/receipts/${deposit.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-line px-3 py-2 text-sm text-plasma-400 hover:border-plasma-500/50"
                    >
                      Ver comprobante
                    </a>
                  </div>
                </div>

                {deposit.status === "PENDING" && (
                  <div className="mt-4 border-t border-line-soft pt-4">
                    <DepositActions depositId={deposit.id} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
