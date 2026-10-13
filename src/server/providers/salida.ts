import "server-only";

import { ProxyAgent } from "undici";

import { env } from "@/lib/env";

/**
 * Salida a internet con IP fija para las llamadas a los proveedores.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El proveedor de Free Fire exige, desde el 15/10/2026 a las 00:00 UTC, que
 * las llamadas a su API lleguen desde una IP registrada; el resto recibe 403.
 *
 * La tienda corre en Vercel, y ahí la IP de salida NO es fija. Medido en
 * producción el 12/10/2026: tres IPs distintas en diez minutos, mismo
 * despliegue y misma región (iad1) —34.227.13.119, 54.167.104.207 y
 * 3.238.238.243—. Registrar una sola funcionaría hasta la siguiente rotación,
 * y a partir de ahí fallarían TODAS las recargas automáticas, de madrugada y
 * sin aviso.
 *
 * La salida pasa entonces por un servidor intermedio con IP fija, que es la
 * que se registra en el proveedor.
 *
 * ── POR QUÉ ES OPCIONAL ─────────────────────────────────────────────────────
 * Sin `PROVIDER_PROXY_URL` esto devuelve `undefined` y `fetch` se comporta
 * EXACTAMENTE como antes. Eso permitió desplegarlo antes de que el servidor
 * existiera: el día que haya IP fija, basta con añadir la variable en Vercel,
 * sin tocar código ni volver a desplegar a las corridas.
 * ────────────────────────────────────────────────────────────────────────────
 */

let cacheado: ProxyAgent | null | undefined;

/**
 * El agente se crea UNA vez y se reutiliza: cada `ProxyAgent` abre su propio
 * grupo de conexiones, y construir uno por petición dejaría sockets colgando
 * en una función que puede atender muchas compras seguidas.
 */
export function salidaConIpFija(): ProxyAgent | undefined {
  if (cacheado !== undefined) return cacheado ?? undefined;

  const url = env().PROVIDER_PROXY_URL.trim();
  cacheado = url ? new ProxyAgent(url) : null;
  return cacheado ?? undefined;
}

/**
 * `dispatcher` es de undici y no está en los tipos de `fetch` que trae
 * TypeScript, aunque Node sí lo respeta. Se concentra el `as` aquí para que
 * los clientes de cada proveedor queden limpios.
 */
export function opcionesDeSalida(): Record<string, unknown> {
  const agente = salidaConIpFija();
  return agente ? { dispatcher: agente } : {};
}
