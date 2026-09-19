import { Badge, Card, EmptyState } from "@/components/ui";
import { CodeGenerator } from "@/components/admin/CodeGenerator";
import { countCodes, listCodes } from "@/server/services/redemptions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function AdminCodesPage() {
  const [codes, totals] = await Promise.all([listCodes(), countCodes()]);
  const disponibles = totals.total - totals.redeemed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Códigos de canje</h1>
        <p className="mt-1 text-sm text-muted">
          {totals.total === 0
            ? "Todavía no has generado ningún código."
            : `${disponibles} sin canjear · ${totals.redeemed} canjeados · ${totals.total} en total.`}
        </p>
      </div>

      <CodeGenerator />

      {codes.length === 0 ? (
        <EmptyState
          title="Sin códigos todavía"
          description="Genera un lote arriba y repártelos en tu promoción o sorteo."
        />
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-base font-bold tracking-widest">{c.code}</span>
                  {c.redeemedAt ? (
                    <Badge tone="info">Canjeado</Badge>
                  ) : (
                    <Badge tone="ok">Disponible</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{c.prize}</p>
              </div>

              <div className="text-right text-xs text-faint">
                {c.redeemedAt ? (
                  <>
                    <p>
                      Canjeado por <span className="text-muted">{c.redeemedByEmail ?? "—"}</span>
                    </p>
                    <p>{dateFmt.format(c.redeemedAt)}</p>
                    {c.orderCode && <p className="font-mono text-muted">{c.orderCode}</p>}
                  </>
                ) : (
                  <p>Creado {dateFmt.format(c.createdAt)}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
