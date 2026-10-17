import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { providerBreakers } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { getProvider } from "@/server/providers/registry";
import { ProviderRequestError } from "@/server/providers/types";

/**
 * Corte automático por proveedor.
 *
 * ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
 * El proveedor de Free Fire se satura los días de evento de recarga, que son
 * los de más venta del mes. Mientras está caído, cada compra descuenta el
 * saldo del comprador y termina en NEEDS_REVIEW; el dueño las resuelve una
 * por una, a mano, el día que menos tiempo tiene.
 *
 * El interruptor manual ya existe, pero depende de que él esté despierto y se
 * dé cuenta. Esto lo hace solo.
 *
 * ── TRES DECISIONES ─────────────────────────────────────────────────────────
 * 1. Corta UN proveedor, no la tienda. Que Free Fire esté caído no es razón
 *    para dejar de vender Blood Strike, que entrega el dueño a mano.
 *
 * 2. Solo cuentan los fallos de "no contesta" —red, timeout, 5xx—. Un "ID de
 *    jugador inválido" es el proveedor funcionando perfectamente y diciendo
 *    que no; cortar por eso dejaría la tienda sin vender porque tres personas
 *    escribieron mal su ID.
 *
 * 3. Para reabrir se le pregunta al proveedor por su saldo, no se usa la
 *    compra de un cliente como conejillo de indias. Si contesta, se reabre
 *    antes de cobrarle a nadie.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Fallos seguidos antes de cortar. Dos pueden ser mala suerte; tres, no. */
const UMBRAL = 3;

/** Espera antes de la primera prueba. */
const ESPERA_BASE_MS = 3 * 60_000;

/** Tope de la espera: si lleva media hora caído, no se le pregunta cada rato. */
const ESPERA_MAX_MS = 30 * 60_000;

/** El proveedor "manual" lo cumple una persona; no hay nada que pueda caerse. */
const SIN_FUSIBLE = new Set(["manual"]);

/**
 * Si este fallo significa que el proveedor no está contestando.
 *
 * `resultUnknown` cubre red, timeout y respuestas ilegibles. Se añaden los
 * 5xx: ahí sí contestó, pero con "me caí", que para esto es lo mismo.
 */
export function esCaidaDelProveedor(e: unknown): boolean {
  if (!(e instanceof ProviderRequestError)) return false;
  return e.resultUnknown || (e.httpStatus ?? 0) >= 500;
}

function esperaMs(reopenCount: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** reopenCount, ESPERA_MAX_MS);
}

async function fila(providerCode: string) {
  const [row] = await db
    .select()
    .from(providerBreakers)
    .where(eq(providerBreakers.providerCode, providerCode))
    .limit(1);
  return row ?? null;
}

async function cerrar(providerCode: string) {
  await db
    .insert(providerBreakers)
    .values({ providerCode, consecutiveFailures: 0, openedAt: null, reopenCount: 0 })
    .onConflictDoUpdate({
      target: providerBreakers.providerCode,
      set: {
        consecutiveFailures: 0,
        openedAt: null,
        reopenCount: 0,
        lastFailureKind: null,
        lastFailureMessage: null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Lo llama el flujo de compra ANTES de descontar saldo. Lanza si el proveedor
 * está cortado; no devuelve nada si se puede comprar.
 */
export async function asegurarProveedorDisponible(providerCode: string): Promise<void> {
  if (SIN_FUSIBLE.has(providerCode)) return;

  const row = await fila(providerCode);
  if (!row?.openedAt) return; // cerrado: se vende con normalidad

  const transcurrido = Date.now() - row.openedAt.getTime();
  if (transcurrido < esperaMs(row.reopenCount)) throw cortado();

  // Media vuelta: se le pregunta al proveedor en vez de arriesgar una compra.
  let vivo = false;
  try {
    vivo = (await getProvider(providerCode).health()).ok;
  } catch {
    vivo = false;
  }

  if (vivo) {
    await cerrar(providerCode);
    logger.info("Proveedor recuperado; se reanudan las compras", { providerCode });
    return;
  }

  await db
    .update(providerBreakers)
    .set({ openedAt: new Date(), reopenCount: row.reopenCount + 1, updatedAt: new Date() })
    .where(eq(providerBreakers.providerCode, providerCode));

  throw cortado();
}

function cortado() {
  return new AppError("PROVIDER_NOT_CONFIGURED", {
    userMessage:
      "Nuestro proveedor no está respondiendo ahora mismo. No te cobramos nada; " +
      "vuelve a intentarlo en unos minutos.",
  });
}

/** Un fallo de "no contesta". Al tercero seguido se corta. */
export async function registrarFallo(
  providerCode: string,
  kind: string,
  message: string,
): Promise<void> {
  if (SIN_FUSIBLE.has(providerCode)) return;

  try {
    const [row] = await db
      .insert(providerBreakers)
      .values({
        providerCode,
        consecutiveFailures: 1,
        lastFailureKind: kind.slice(0, 32),
        lastFailureMessage: message.slice(0, 500),
      })
      .onConflictDoUpdate({
        target: providerBreakers.providerCode,
        set: {
          consecutiveFailures: sql`${providerBreakers.consecutiveFailures} + 1`,
          lastFailureKind: kind.slice(0, 32),
          lastFailureMessage: message.slice(0, 500),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (row && !row.openedAt && row.consecutiveFailures >= UMBRAL) {
      await db
        .update(providerBreakers)
        .set({ openedAt: new Date(), updatedAt: new Date() })
        .where(eq(providerBreakers.providerCode, providerCode));

      logger.error("Proveedor cortado automáticamente", {
        providerCode,
        fallos: row.consecutiveFailures,
        kind,
      });
    }
  } catch (e) {
    // El fusible NUNCA puede tumbar una compra que por lo demás iba bien.
    logger.error("No se pudo registrar el fallo del proveedor", {
      providerCode,
      error: (e as Error).message,
    });
  }
}

/** Una compra que salió bien borra el historial de fallos. */
export async function registrarExito(providerCode: string): Promise<void> {
  if (SIN_FUSIBLE.has(providerCode)) return;
  try {
    await cerrar(providerCode);
  } catch (e) {
    logger.error("No se pudo limpiar el fusible del proveedor", {
      providerCode,
      error: (e as Error).message,
    });
  }
}

export interface EstadoFusible {
  providerCode: string;
  cortado: boolean;
  openedAt: Date | null;
  consecutiveFailures: number;
  /** Cuándo se volverá a probar el proveedor. Null si no está cortado. */
  proximaPrueba: Date | null;
  lastFailureMessage: string | null;
}

/** Para el panel: qué proveedores están cortados ahora mismo. */
export async function estadoDeFusibles(): Promise<EstadoFusible[]> {
  const rows = await db.select().from(providerBreakers);
  return rows.map((r) => ({
    providerCode: r.providerCode,
    cortado: r.openedAt !== null,
    openedAt: r.openedAt,
    consecutiveFailures: r.consecutiveFailures,
    proximaPrueba: r.openedAt ? new Date(r.openedAt.getTime() + esperaMs(r.reopenCount)) : null,
    lastFailureMessage: r.lastFailureMessage,
  }));
}
