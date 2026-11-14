import "server-only";

import type { ProviderAdapter } from "./types";
import { recargasAmerica, PROVIDER_CODE as RECARGAS_AMERICA } from "./recargas-america";
import { epinby, PROVIDER_CODE as EPINBY } from "./epinby";
import { manualProvider, PROVIDER_CODE as MANUAL } from "./manual";
import { sixoff, PROVIDER_CODE as SIXOFF } from "./sixoff";
import { AppError } from "@/lib/errors";

/**
 * Registro de proveedores.
 *
 * Añadir un segundo proveedor (punto 12 del brief) es exactamente esto:
 *   1. crear `src/server/providers/<nuevo>/` implementando `ProviderAdapter`
 *   2. añadir una línea a este mapa
 * El resto de la aplicación no se entera: órdenes, billetera y UI trabajan
 * contra la interfaz, no contra RecargasAmérica.
 *
 * "manual" es un proveedor especial: no habla con ningún API, es para
 * productos que el administrador entrega a mano (ver providers/manual).
 */
const ADAPTERS: Record<string, ProviderAdapter> = {
  [RECARGAS_AMERICA]: recargasAmerica,
  [EPINBY]: epinby,
  [MANUAL]: manualProvider,
  [SIXOFF]: sixoff,
};

/** Proveedor por defecto de la v1 (el que usa `syncCatalog()` cuando no se especifica otro). */
export const DEFAULT_PROVIDER = RECARGAS_AMERICA;

/**
 * Proveedores cuyo catálogo se sincroniza solo.
 *
 * SixoFire queda FUERA a propósito, aunque tenga catálogo. Sus artículos y los
 * de la tienda no son uno a uno: ellos venden un "Fragmento Universal" con
 * cantidad variable, y el dueño vende cinco paquetes —99, 150, 300, 600 y
 * 1200— que son ese mismo artículo en cantidades distintas. Sincronizar
 * crearía un producto suelto sin precio ni foto y dejaría los cinco suyos
 * huérfanos. Sus once artículos ya existen y se reapuntan, no se recrean.
 */
export const SYNCABLE_PROVIDERS = [RECARGAS_AMERICA, EPINBY];

export function getProvider(code: string = DEFAULT_PROVIDER): ProviderAdapter {
  const adapter = ADAPTERS[code];
  if (!adapter) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      internalMessage: `Proveedor desconocido: ${code}`,
    });
  }
  return adapter;
}

export function listProviders(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}
