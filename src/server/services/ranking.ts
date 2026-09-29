import "server-only";

import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Ranking mensual de recargas ("top recargueros").
 *
 * ── POR QUÉ ESTÁ CACHEADO ───────────────────────────────────────────────────
 * Es una agregación sobre toda la tabla de pedidos y se muestra en una página
 * pública, o sea la combinación exacta que dispararía el consumo de Neon: en
 * septiembre de 2026 la tienda llegó al 87% de las horas de cómputo gratuitas
 * y estuvo a punto de caerse. Con la caché, la consulta se ejecuta como mucho
 * una vez cada CADA_CUANTO_SEGUNDOS por más visitas que haya.
 *
 * Se calcula la tabla ENTERA una sola vez, y de ahí salen las dos cosas que
 * hacen falta: el top público y el puesto de cada quien. Consultar el puesto
 * de un usuario por separado significaría una consulta por visitante, que es
 * justo lo que se quiere evitar.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** El ranking cambia despacio; cinco minutos de retraso no los nota nadie. */
const CADA_CUANTO_SEGUNDOS = 300;

export interface FilaRanking {
  userId: string;
  /** El nombre con el que se registró. Ver la nota de privacidad más abajo. */
  name: string;
  totalCents: number;
  orders: number;
}

export interface PuestoPropio {
  /** 1-indexado, tal y como se le muestra a la persona. */
  position: number;
  totalCents: number;
  orders: number;
  /** true si además está entre los que se ven en la página pública. */
  inTopPublic: boolean;
}

/** Cuántos se publican. Solo estos se ven; el resto solo ve su propio puesto. */
export const TAMANO_TOP_PUBLICO = 10;

/**
 * El mes corriente en hora de Lima, no en UTC. Sin esto, el ranking se
 * reiniciaría a las 7 de la tarde del último día del mes.
 *
 * Se descartan los administradores y las cuentas suspendidas, y también a
 * quien pidió no aparecer: ese no ocupa puesto, simplemente no está, así que
 * los demás suben.
 *
 * Cuenta por fecha de COMPRA, no de entrega. Es la fecha que el comprador
 * recuerda, y las entregas manuales pueden marcarse días después.
 */
async function calcular(): Promise<FilaRanking[]> {
  const filas = await db.execute<{
    user_id: string;
    name: string;
    total_cents: number;
    orders: number;
  }>(sql`
    SELECT o.user_id,
           u.name,
           SUM(o.price_cents)::int AS total_cents,
           COUNT(*)::int           AS orders
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'COMPLETED'
      AND u.role = 'USER'
      AND u.status = 'ACTIVE'
      AND u.hide_from_ranking = false
      AND o.created_at >= (
        date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
      )
    GROUP BY o.user_id, u.name
    ORDER BY total_cents DESC, orders DESC, u.name ASC
  `);

  return filas.rows.map((f) => ({
    userId: f.user_id,
    name: f.name,
    totalCents: Number(f.total_cents),
    orders: Number(f.orders),
  }));
}

const rankingCacheado = unstable_cache(calcular, ["ranking-mensual"], {
  revalidate: CADA_CUANTO_SEGUNDOS,
  tags: ["ranking"],
});

export async function rankingMensual(): Promise<FilaRanking[]> {
  // Si la consulta falla, la página se muestra vacía en vez de romperse: un
  // ranking es decorativo, nunca debe tumbar la portada ni la cuenta.
  return rankingCacheado().catch(() => []);
}

export async function topPublico(): Promise<FilaRanking[]> {
  return (await rankingMensual()).slice(0, TAMANO_TOP_PUBLICO);
}

/** El puesto de una persona, o null si este mes todavía no ha recargado. */
export async function puestoDe(userId: string): Promise<PuestoPropio | null> {
  const ranking = await rankingMensual();
  const indice = ranking.findIndex((f) => f.userId === userId);
  if (indice === -1) return null;

  const fila = ranking[indice];
  return {
    position: indice + 1,
    totalCents: fila.totalCents,
    orders: fila.orders,
    inTopPublic: indice < TAMANO_TOP_PUBLICO,
  };
}

/**
 * "setiembre de 2026", para encabezar la página y dejar claro que esto se
 * reinicia. Sin el mes a la vista, quien entra el día 2 cree que el ranking
 * está roto porque los números bajaron.
 *
 * En minúscula porque en castellano los meses van así y esto se usa dentro de
 * una frase.
 */
export function mesEnCurso(): string {
  return new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date());
}

/**
 * Si esta persona pidió no aparecer en el ranking.
 *
 * Va sin caché a propósito: es su propia preferencia, la lee solo ella en su
 * cuenta, y verla desactualizada cinco minutos después de cambiarla haría
 * pensar que el interruptor no funciona.
 */
export async function hideFromRankingOf(userId: string): Promise<boolean> {
  const [fila] = await db
    .select({ hidden: users.hideFromRanking })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return fila?.hidden ?? false;
}
