import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LogoRain } from "@/components/layout/LogoRain";

/**
 * Layout con cabecera y pie: envuelve la web pública y la zona de usuario.
 *
 * `LogoRain` va aquí y no en el layout raíz para que el panel de
 * administración quede limpio: ahí se trabaja con cifras y formularios, y un
 * fondo en movimiento solo estorbaría.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <LogoRain />
      <SiteHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
