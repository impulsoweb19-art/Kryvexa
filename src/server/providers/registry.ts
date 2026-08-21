import "server-only";

import type { ProviderAdapter } from "./types";
import { recargasAmerica, PROVIDER_CODE as RECARGAS_AMERICA } from "./recargas-america";
import { manualProvider, PROVIDER_CODE as MANUAL } from "./manual";
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
  [MANUAL]: manualProvider,
};

/** Proveedor por defecto de la v1. */
export const DEFAULT_PROVIDER = RECARGAS_AMERICA;

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
