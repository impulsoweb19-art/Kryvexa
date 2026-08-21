import type { MetadataRoute } from "next";

/**
 * robots.txt generado por Next.js (aparece en /robots.txt).
 *
 * Deja indexar las páginas públicas (inicio, tienda, login, registro) y le
 * pide a Google que NO indexe el panel de administración, la API ni las
 * páginas de cuenta (billetera/pedidos): no tienen nada que buscar ahí y
 * evita que aparezcan enlaces internos en los resultados de búsqueda.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/billetera", "/pedidos"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
