import "server-only";

import { unstable_cache } from "next/cache";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { diamantesDe } from "@/lib/diamantes";

/**
 * Ranking mensual de diamantes de Free Fire ("top recargueros").
 *
 * Cuenta SOLO diamantes de Free Fire: es lo que más vende la tienda y es la
 * única moneda comparable entre compradores. Ver `lib/diamantes.ts`.
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
  /** Diamantes de Free Fire acumulados en el mes. */
  diamonds: number;
  /** Recargas que aportaron diamantes; las demás compras no cuentan aquí. */
  orders: number;
}

export interface PuestoPropio {
  /** 1-indexado, tal y como se le muestra a la persona. */
  position: number;
  diamonds: number;
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
  const filas = await db.execute<{ user_id: string; name: string; product_name: string }>(sql`
    SELECT o.user_id, u.name, o.product_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.status = 'COMPLETED'
      AND o.game_name ILIKE '%free fire%'
      AND u.role = 'USER'
      AND u.status = 'ACTIVE'
      AND u.hide_from_ranking = false
      AND o.created_at >= (
        date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
      )
  `);

  /*
    La suma se hace aquí y no en SQL porque la cantidad de diamantes vive
    dentro del nombre del paquete ("1060 + 106 Diamantes") y sacarla con
    expresiones regulares de Postgres sería ilegible y, sobre todo,
    imposible de probar. En JavaScript es `diamantesDe`, con sus pruebas.

    El coste es traer las compras del mes, unos cientos de filas, una vez
    cada cinco minutos. Barato frente a una consulta por visitante.
  */
  const porUsuario = new Map<string, FilaRanking>();

  for (const f of filas.rows) {
    const diamantes = diamantesDe(f.product_name);
    if (diamantes <= 0) continue; // pases, membresías y Cajas Evo no cuentan

    const actual = porUsuario.get(f.user_id);
    if (actual) {
      actual.diamonds += diamantes;
      actual.orders += 1;
    } else {
      porUsuario.set(f.user_id, {
        userId: f.user_id,
        name: f.name,
        diamonds: diamantes,
        orders: 1,
      });
    }
  }

  return [...porUsuario.values()].sort(
    (a, b) => b.diamonds - a.diamonds || b.orders - a.orders || a.name.localeCompare(b.name),
  );
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
    diamonds: fila.diamonds,
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
