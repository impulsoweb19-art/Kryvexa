import Link from "next/link";
import { Badge, Button, Card, ORDER_STATUS_META, Stat } from "@/components/ui";
import { formatPEN, formatUSD } from "@/lib/money";
import { dashboardStats, latestOrders, providerHealth } from "@/server/services/stats";
import { catalogStats } from "@/server/services/catalog";
import { getConfig } from "@/server/services/settings";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function AdminDashboard() {
  const [stats, orders, health, catalog, config] = await Promise.all([
    dashboardStats(),
    latestOrders(8),
    providerHealth(),
    catalogStats(),
    getConfig(),
  ]);

  const lowBalance =
    health.balanceCents !== null && health.balanceCents < config.providerLowBalanceUsdCents;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Resumen</h1>
        <p className="mt-1 text-sm text-muted">Estado general de la plataforma.</p>
      </div>

      {/* Estado de la API externa */}
      <Card
        className={
          health.ok && !lowBalance
            ? "border-ok/30"
            : health.ok
              ? "border-warn/40"
              : "border-danger/40"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className={`size-2.5 rounded-full ${health.ok ? "bg-ok" : "bg-danger"}`}
                aria-hidden
              />
              <h2 className="font-bold">Conexión con RecargasAmérica</h2>
              {health.mock && <Badge tone="warn">Modo simulado</Badge>}
            </div>
            <p className="mt-1.5 text-sm text-muted">
              {health.ok
                ? `Respondiendo en ${health.latencyMs} ms.`
                : (health.message ?? "Sin conexión con el proveedor.")}
              {health.message && health.ok ? ` ${health.message}` : ""}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-faint">Saldo del revendedor</p>
            <p
              className={`text-xl font-bold tabular-nums ${lowBalance ? "text-danger" : "text-ink"}`}
            >
              {health.balanceCents !== null ? formatUSD(health.balanceCents) : "—"}
            </p>
            {lowBalance && <p className="text-xs text-danger">Saldo bajo: recarga con el proveedor</p>}
          </div>
        </div>
      </Card>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Usuarios registrados"
          value={stats.users.total}
          sub={`${stats.users.last7d} nuevos esta semana`}
        />
        <Stat
          label="Depósitos pendientes"
          value={stats.deposits.pending}
          sub={formatPEN(stats.deposits.pendingCents)}
          tone={stats.deposits.pending > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Depósitos aprobados"
          value={formatPEN(stats.deposits.approvedCents)}
          sub={`Hoy: ${formatPEN(stats.deposits.approvedTodayCents)}`}
          tone="ok"
        />
        <Stat
          label="Ventas totales"
          value={formatPEN(stats.orders.salesCents)}
          sub={`Hoy: ${formatPEN(stats.orders.salesTodayCents)}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pedidos completados" value={stats.orders.completed} tone="ok" />
        <Stat
          label="Pedidos en proceso"
          value={stats.orders.pending}
          tone={stats.orders.pending > 0 ? "warn" : "neutral"}
        />
        <Stat
          label="Requieren revisión"
          value={stats.orders.needsReview}
          tone={stats.orders.needsReview > 0 ? "danger" : "neutral"}
          sub={stats.orders.needsReview > 0 ? "Resuélvelos manualmente" : "Todo en orden"}
        />
        <Stat
          label="Saldo en billeteras"
          value={formatPEN(stats.walletLiabilityCents)}
          sub="Dinero que deben poder gastar los usuarios"
        />
      </div>

      {/* Avisos accionables */}
      {(stats.deposits.pending > 0 ||
        stats.orders.needsReview > 0 ||
        stats.orders.pendingManual > 0 ||
        catalog.visible === 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.deposits.pending > 0 && (
            <Link href="/admin/depositos">
              <Card className="h-full border-warn/40 transition-colors hover:border-warn">
                <p className="text-sm font-semibold text-warn">
                  {stats.deposits.pending} depósito(s) esperando revisión
                </p>
                <p className="mt-1 text-xs text-muted">Aprueba o rechaza para acreditar saldo.</p>
              </Card>
            </Link>
          )}
          {stats.orders.pendingManual > 0 && (
            <Link href="/admin/pedidos?status=PENDING">
              <Card className="h-full border-warn/40 transition-colors hover:border-warn">
                <p className="text-sm font-semibold text-warn">
                  {stats.orders.pendingManual} pedido(s) de entrega manual
                </p>
                <p className="mt-1 text-xs text-muted">
                  Pase Booyah, membresías… Haz la recarga tú mismo y márcalos "Entregado".
                </p>
              </Card>
            </Link>
          )}
          {stats.orders.needsReview > 0 && (
            <Link href="/admin/pedidos?status=NEEDS_REVIEW">
              <Card className="h-full border-danger/40 transition-colors hover:border-danger">
                <p className="text-sm font-semibold text-danger">
                  {stats.orders.needsReview} pedido(s) sin confirmar
                </p>
                <p className="mt-1 text-xs text-muted">Ciérralos manualmente tras verificarlos.</p>
              </Card>
            </Link>
          )}
          {catalog.visible === 0 && (
            <Link href="/admin/catalogo">
              <Card className="h-full border-warn/40 transition-colors hover:border-warn">
                <p className="text-sm font-semibold text-warn">No hay productos publicados</p>
                <p className="mt-1 text-xs text-muted">Sincroniza el catálogo con el proveedor.</p>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* Últimas transacciones */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Últimas transacciones</h2>
          <Link href="/admin/pedidos">
            <Button size="sm" variant="ghost">
              Ver todos
            </Button>
          </Link>
        </div>

        {orders.length === 0 ? (
          <Card className="text-sm text-muted">Todavía no hay pedidos.</Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line-soft">
              {orders.map((o) => {
                const meta = ORDER_STATUS_META[o.status] ?? { label: o.status, tone: "neutral" as const };
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {o.productName}
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {o.userEmail} · {dateFmt.format(o.createdAt)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatPEN(o.priceCents)}</span>
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
