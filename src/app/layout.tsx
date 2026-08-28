import type { Metadata, Viewport } from "next";
import "./globals.css";
import { IntroAnimation } from "@/components/layout/IntroAnimation";
import { DEFAULT_CONFIG, getConfig } from "@/server/services/settings";
import { baseUrl } from "@/lib/base-url";

/**
 * Título de la pestaña y texto que muestra Google.
 *
 * Sale del nombre configurado en el panel, no de un texto fijo en el código:
 * si algún día se cambia el nombre de la tienda, se cambia en un solo sitio y
 * se actualiza en todas partes, incluido lo que ve un buscador.
 *
 * Si la base de datos no responde se usa el nombre por defecto en vez de
 * dejar caer la página: quedarse sin título es un detalle, quedarse sin
 * página es un problema.
 */
export async function generateMetadata(): Promise<Metadata> {
  let storeName = DEFAULT_CONFIG.storeName;
  try {
    storeName = (await getConfig()).storeName || storeName;
  } catch {
    /* se usa el valor por defecto */
  }

  const title = `${storeName} | Todo lo que necesitas, en un solo lugar`;
  const description =
    "Recargas de juegos al instante: diamantes, pases y membresías de Free Fire. Cargas saldo por Yape y compras cuando quieras, con entrega inmediata.";

  return {
    // `baseUrl()` tolera una APP_URL mal escrita (por ejemplo sin https://) en
    // vez de lanzar un error que impediría generar las páginas.
    metadataBase: baseUrl(),
    title: {
      default: title,
      template: `%s · ${storeName}`,
    },
    description,
    robots: { index: true, follow: true },
    applicationName: storeName,
    // Sin esto, WhatsApp/Telegram/Facebook muestran el link sin imagen al compartirlo.
    openGraph: {
      title,
      description,
      siteName: storeName,
      type: "website",
      locale: "es_PE",
      images: [{ url: "/marca/kryvexa-logo.png", width: 418, height: 256, alt: storeName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/marca/kryvexa-logo.png"],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#06070c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body className="min-h-dvh antialiased">
        <IntroAnimation />
        {children}
      </body>
    </html>
  );
}
