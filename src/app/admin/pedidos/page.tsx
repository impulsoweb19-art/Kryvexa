import Link from "next/link";
import { Badge, Card, EmptyState, ORDER_STATUS_META, cx } from "@/components/ui";
import { OrderActions } from "@/components/admin/OrderActions";
import { formatPEN, formatUSD } from "@/lib/money";
import { listOrdersForAdmin } from "@/server/services/orders";
import type { OrderStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ value: OrderStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "COMPLETED", label: "Completados" },
  { value: "PENDING", label: "En proceso" },
  { value: "NEEDS_REVIEW", label: "Revisión" },
  { value: "REFUNDED", label: "Devueltos" },
];

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "ALL") as OrderStatus | "ALL";

  const { rows, total } = await listOrdersForAdmin({
    status: status === "ALL" ? undefined : status,
    search: sp.q,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <p className="mt-1 text-sm text-muted">
          Cada pedido guarda el ID del jugador, la referencia del proveedor y el importe cobrado.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/pedidos?status=${f.value}`}
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

      <form className="flex gap-2" action="/admin/pedidos">
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por código, correo, referencia o ID de jugador…"
          className="w-full rounded-xl border border-line bg-abyss px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-flame-500/70 focus:outline-none"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No hay pedidos con este filtro" />
      ) : (
        <div className="space-y-3">
          {rows.map(({ order, user }) => {
            const meta = ORDER_STATUS_META[order.status] ?? { label: order.status, tone: "neutral" as const };
            const inputs = order.inputs as Record<string, string>;
            const resolvable = ["PENDING", "PROCESSING", "NEEDS_REVIEW"].includes(order.status);

            return (
              <Card key={order.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-faint">{order.code}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </div>

                    <p className="mt-2 font-semibold">
                      {order.gameName} — {order.productName}
                    </p>
                    <p className="text-xs text-muted">
                      {user.name} · {user.email}
                    </p>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted sm:grid-cols-2">
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Datos:</dt>
                        <dd className="font-mono">
                          {Object.entries(inputs)
                            .map(([k, v]) => `${k}=${v}`)
                            .join("  ")}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Referencia:</dt>
                        <dd className="font-mono">{order.providerReference ?? "—"}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Fecha:</dt>
                        <dd>{dateFmt.format(order.createdAt)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-faint">Costo proveedor:</dt>
                        <dd>{formatUSD(order.costUsdCents)}</dd>
                      </div>
                    </dl>

                    {order.failureMessage && (
                      <p className="mt-2 text-xs text-danger">{order.failureMessage}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-faint">Cobrado</p>
                    <p className="text-xl font-black tabular-nums">{formatPEN(order.priceCents)}</p>
                    {order.refundedAt && <p className="text-xs text-plasma-400">Saldo devuelto</p>}
                  </div>
                </div>

                {resolvable && (
                  <div className="mt-4 border-t border-line-soft pt-4">
                    <OrderActions orderId={order.id} />
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
