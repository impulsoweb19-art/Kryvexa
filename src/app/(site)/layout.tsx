import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LogoRain } from "@/components/layout/LogoRain";
import { getConfig } from "@/server/services/settings";

/**
 * Layout con cabecera y pie: envuelve la web pública y la zona de usuario.
 *
 * `LogoRain` va aquí y no en el layout raíz para que el panel de
 * administración quede limpio: ahí se trabaja con cifras y formularios, y un
 * fondo en movimiento solo estorbaría.
 */
export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig().catch(() => null);
  const aviso = config?.storeNoticeEnabled ? config.storeNoticeText.trim() : "";

  return (
    <div className="relative flex min-h-dvh flex-col">
      <LogoRain />
      <SiteHeader />

      {/*
        El aviso del dueño, encima de todo y en todas las pantallas.
        No se puede cerrar a propósito: existe para los días sin stock, y un
        cartel que se descarta de un toque lo descarta justamente quien más
        necesita leerlo. Si se queda sin texto no se muestra nada, en vez de
        una barra vacía que parece un fallo.
      */}
      {aviso && (
        <div className="relative z-20 border-b border-warn/40 bg-warn/15">
          <p className="mx-auto max-w-6xl px-4 py-3 text-center text-sm font-medium leading-relaxed text-warn sm:px-6">
            {aviso}
          </p>
        </div>
      )}

      <main className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
