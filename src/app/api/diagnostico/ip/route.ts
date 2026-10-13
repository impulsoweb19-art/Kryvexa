import { ok, route } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORAL — se borra en cuanto tengamos la respuesta.
 *
 * Devuelve la IP con la que ESTE servidor sale a internet, que es la que el
 * proveedor vería al recibir nuestras llamadas y la que habría que registrar
 * en su lista de IPs permitidas antes del 14/10.
 *
 * Va sin autenticación a propósito: no toca la base de datos, no lee ninguna
 * variable de entorno y lo único que revela es una IP que ya conoce cualquier
 * servicio al que la tienda llama. Protegerlo con el secreto del cron habría
 * obligado a sacar ese secreto de Vercel para poder consultarlo, que es un
 * riesgo mayor que el que evita.
 */
export const GET = route("diagnostico.ip", async () => {
  const fuentes = [
    { nombre: "ipify", url: "https://api.ipify.org?format=json" },
    { nombre: "ifconfig", url: "https://ifconfig.me/all.json" },
  ];

  const resultados = await Promise.all(
    fuentes.map(async ({ nombre, url }) => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        const cuerpo = (await res.json()) as Record<string, unknown>;
        return { fuente: nombre, ip: cuerpo.ip ?? cuerpo.ip_addr ?? null };
      } catch (e) {
        return { fuente: nombre, error: (e as Error).message };
      }
    }),
  );

  return ok({
    resultados,
    region: process.env.VERCEL_REGION ?? null,
    momento: new Date().toISOString(),
  });
});
