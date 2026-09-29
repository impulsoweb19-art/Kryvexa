"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Card } from "@/components/ui";

import type { PuestoPropio } from "@/server/services/ranking";

/** Miles con punto, como se leen los diamantes dentro del juego. */
const enteros = new Intl.NumberFormat("es-PE");

/**
 * El puesto propio dentro del ranking, en la cuenta de cada persona.
 *
 * Es la mitad que de verdad mueve la aguja: la página pública solo enseña a
 * diez, y ver "estás en el puesto 43" es lo que le da algo que perseguir a los
 * otros noventa. Por eso vive aquí y no solo en /top.
 *
 * El puesto SOLO lo ve su dueño, y se muestra sin el total de participantes:
 * "43 de 68" le diría a cualquier cliente cuántos compradores tiene la tienda,
 * que es información del negocio, no suya.
 */
export function RankingCard({
  puesto,
  oculto: ocultoInicial,
}: {
  puesto: PuestoPropio | null;
  oculto: boolean;
}) {
  const [oculto, setOculto] = useState(ocultoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(valor: boolean) {
    setGuardando(true);
    setError(null);
    // Optimista: el interruptor responde al instante y se revierte si falla.
    setOculto(valor);
    try {
      const res = await fetch("/api/account/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: valor }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No pudimos guardar el cambio.");
    } catch (e) {
      setOculto(!valor);
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">Ranking del mes</h2>
        <p className="mt-1 text-sm text-muted">
          Los diez primeros salen en el{" "}
          <Link href="/top" className="text-crown-400 hover:underline">
            top público
          </Link>
          . Cuentan los diamantes de Free Fire. Tu puesto solo lo ves tú.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {oculto ? (
        <p className="rounded-xl border border-line bg-abyss px-4 py-3 text-sm text-muted">
          Estás fuera del ranking. No apareces en el top ni ocupas un puesto.
        </p>
      ) : puesto ? (
        <div className="flex items-center justify-between rounded-xl border border-line bg-abyss px-4 py-3">
          <div>
            <p className="text-xs text-faint">Tu puesto este mes</p>
            <p className="text-2xl font-black tabular-nums text-crown-400">#{puesto.position}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums text-crown-400">
              {enteros.format(puesto.diamonds)} <span className="text-xs text-muted">diamantes</span>
            </p>
            <p className="text-xs text-muted">
              {puesto.orders} {puesto.orders === 1 ? "recarga" : "recargas"}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-line bg-abyss px-4 py-3 text-sm text-muted">
          Todavía no tienes puesto este mes. Recarga diamantes de Free Fire y entras al ranking.
        </p>
      )}

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={oculto}
          disabled={guardando}
          onChange={(e) => cambiar(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-line bg-abyss accent-flame-500"
        />
        <span className="text-muted">
          No quiero aparecer en el ranking público. Tu nombre deja de mostrarse y dejas de ocupar
          puesto.
        </span>
      </label>
    </Card>
  );
}
