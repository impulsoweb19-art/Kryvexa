import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, ORDER_STATUS_META } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { listUserOrders } from "@/server/services/orders";

export const metadata: Metadata = { title: "Mis pedidos" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function OrdersPage() {
  const user = await requireUserPage("/pedidos");
  const orders = await listUserOrders(user.id, 50);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Mis pedidos</h1>
          <p className="mt-1.5 text-sm text-muted">Historial completo de tus recargas.</p>
        </div>
        <Link href="/tienda">
          <Button variant="secondary">Comprar otra recarga</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Aún no tienes pedidos"
            description="Cuando compres tu primera recarga aparecerá aquí con su estado y referencia."
            action={
              <Link href="/tienda">
                <Button>Ir a la tienda</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <Card className="rise rise-2 mt-8 overflow-hidden p-0">
          <ul className="divide-y divide-line-soft">
            {orders.map((o) => {
              const meta = ORDER_STATUS_META[o.status] ?? { label: o.status, tone: "neutral" as const };
              const inputs = o.inputs as Record<string, string>;
              return (
                <li key={o.id} className="p-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{o.productName}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {o.gameName} · {dateFmt.format(o.createdAt)}
                      </p>
                      <p className="mt-1 font-mono text-xs text-faint">
                        {o.code}
                        {o.providerReference ? ` · Ref: ${o.providerReference}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {Object.entries(inputs)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                      {o.failureMessage && (
                        <p className="mt-1.5 text-xs text-danger">{o.failureMessage}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatPEN(o.priceCents)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
