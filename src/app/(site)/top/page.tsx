import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, EmptyState } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { getCurrentUser } from "@/lib/session";
import { mesEnCurso, puestoDe, topPublico, TAMANO_TOP_PUBLICO } from "@/server/services/ranking";

export const metadata: Metadata = {
  title: "Top recargueros",
  description: "Los que más recargan cada mes en Kryvexa.",
};
export const dynamic = "force-dynamic";

/**
 * Ranking público del mes.
 *
 * Es PÚBLICA a propósito: se ve sin cuenta y sin iniciar sesión, porque parte
 * de su gracia es que alguien que todavía no compra vea la competencia y
 * quiera entrar. Los datos que salen son el nombre de registro y lo recargado
 * en el mes, y solo de los diez primeros; cualquiera puede salirse desde su
 * cuenta.
 *
 * La consulta que hay detrás está cacheada cinco minutos (ver
 * `server/services/ranking.ts`): esta página puede recibir muchas visitas y no
 * puede convertirse en una consulta a la base de datos por cada una.
 */
export default async function TopPage() {
  const [top, usuario] = await Promise.all([topPublico(), getCurrentUser()]);
  const propio = usuario ? await puestoDe(usuario.id) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1">
        <Link href="/" className="text-sm text-muted hover:text-ink">
          ← Volver al inicio
        </Link>

        <h1 className="mt-3 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
          Top <span className="text-gradient-flame">recargueros</span>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
          Los {TAMANO_TOP_PUBLICO} que más recargaron en {mesEnCurso()}. El primer día de cada mes
          el ranking vuelve a cero y todos arrancan parejos.
        </p>
      </div>

      {propio && (
        <Card className="rise rise-2 mt-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-faint">Tu puesto este mes</p>
            <p className="text-2xl font-black tabular-nums text-flame-400">#{propio.position}</p>
          </div>
          <p className="text-right text-sm text-muted">
            {propio.inTopPublic
              ? "Estás en el top. Solo tú ves este recuadro."
              : "Solo tú ves tu puesto. Sigue recargando para entrar al top."}
          </p>
        </Card>
      )}

      {top.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="El ranking de este mes está por empezar"
            description="Todavía no hay recargas registradas este mes. El primero en recargar abre la tabla."
            action={
              <Link href="/#elige-juego">
                <Button>Recargar ahora</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ol className="rise rise-3 mt-8 space-y-2">
          {top.map((fila, i) => {
            const puesto = i + 1;
            const esPodio = puesto <= 3;
            return (
              <li
                key={fila.userId}
                className={[
                  "flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors",
                  esPodio
                    ? "border-flame-500/30 bg-flame-500/5"
                    : "border-line-soft bg-surface hover:border-line",
                ].join(" ")}
              >
                <span
                  className={[
                    "grid size-9 shrink-0 place-items-center rounded-full text-sm font-black tabular-nums",
                    esPodio
                      ? "bg-flame-500 text-void"
                      : "border border-line bg-abyss text-muted",
                  ].join(" ")}
                >
                  {puesto}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold leading-tight">{fila.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {fila.orders} {fila.orders === 1 ? "recarga" : "recargas"}
                  </span>
                </span>

                <span className="shrink-0 text-right font-bold tabular-nums text-ok">
                  {formatPEN(fila.totalCents)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-8 text-xs leading-relaxed text-faint">
        Aparece el nombre con el que cada persona se registró. Si no quieres salir en esta lista,
        puedes desactivarlo cuando quieras desde{" "}
        <Link href="/cuenta" className="underline hover:text-muted">
          tu cuenta
        </Link>
        .
      </p>
    </div>
  );
}
