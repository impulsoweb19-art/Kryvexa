import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { UserActions } from "@/components/admin/UserActions";
import { formatPEN } from "@/lib/money";
import { listUsersForAdmin } from "@/server/services/stats";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Lima",
});

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const { rows, total } = await listUsersForAdmin({ search: sp.q, limit: 50 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="mt-1 text-sm text-muted">{total} cuenta(s) registradas.</p>
      </div>

      <form className="flex gap-2" action="/admin/usuarios">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar por nombre o correo…"
          className="w-full rounded-xl border border-line bg-abyss px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-flame-500/70 focus:outline-none"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Sin resultados" />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-line-soft">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {u.name}
                    {u.role === "ADMIN" && <Badge tone="info">Admin</Badge>}
                    {u.status === "SUSPENDED" && <Badge tone="danger">Suspendido</Badge>}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{u.email}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    Alta {dateFmt.format(u.createdAt)}
                    {u.lastLoginAt ? ` · Último ingreso ${dateFmt.format(u.lastLoginAt)}` : ""}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-faint">Saldo</p>
                    <p className="font-semibold tabular-nums text-ok">
                      {formatPEN(u.balanceCents ?? 0)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/pedidos?q=${encodeURIComponent(u.email)}`}
                    className="text-xs text-plasma-400 hover:underline"
                  >
                    Ver pedidos
                  </Link>
                  {u.role !== "ADMIN" && <UserActions userId={u.id} status={u.status} />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
