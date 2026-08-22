/**
 * Dirección pública del sitio, para armar enlaces absolutos (mapa del sitio,
 * robots.txt, URLs canónicas, vistas previas al compartir en redes).
 *
 * Por qué existe este archivo en vez de leer `process.env.APP_URL` directo:
 * `new URL("kryvexa.net")` LANZA un error, porque le falta el esquema. Si eso
 * ocurre dentro de `generateMetadata`, Next.js no puede generar las páginas y
 * el despliegue entero falla por una variable mal escrita. Un dato de
 * configuración con una errata debe degradar con elegancia, no tumbar el sitio.
 *
 * Orden de preferencia:
 *  1. `APP_URL` — lo que configuró el administrador. Si le falta el esquema,
 *     se le añade `https://` en vez de reventar.
 *  2. La dirección que Vercel asigna al proyecto. Así, antes de comprar el
 *     dominio, los enlaces ya salen correctos sin configurar nada.
 *  3. `http://localhost:3000` para el desarrollo local.
 */

function candidates(): Array<string | undefined> {
  return [
    process.env.APP_URL,
    // Las define Vercel automáticamente; no hay que añadirlas a mano.
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    "http://localhost:3000",
  ];
}

export function baseUrl(): URL {
  for (const raw of candidates()) {
    const value = raw?.trim();
    if (!value) continue;
    // Vercel entrega el host sin esquema ("mi-app.vercel.app").
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      return new URL(withScheme);
    } catch {
      // Valor inservible: se prueba el siguiente candidato.
    }
  }
  return new URL("http://localhost:3000");
}

/** La misma dirección como texto, sin la barra final. */
export function baseUrlString(): string {
  return baseUrl().origin;
}
