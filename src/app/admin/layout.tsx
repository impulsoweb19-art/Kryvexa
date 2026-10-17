import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/guards";
import { getConfig } from "@/server/services/settings";
import { estadoDeFusibles } from "@/server/services/breaker";

/**
 * Layout del panel.
 *
 * La protección vive AQUÍ, en el servidor: `requireAdminPage()` corre antes de
 * renderizar cualquier página hija. Además, cada endpoint /api/admin/* vuelve a
 * exigir el rol por su cuenta — nunca se confía en que el usuario haya llegado
 * "por la ruta correcta".
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, config, fusibles] = await Promise.all([
    requireAdminPage(),
    getConfig(),
    estadoDeFusibles().catch(() => []),
  ]);
  const cortados = fusibles.filter((f) => f.cortado);

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-void/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2.5">
              <LogoMark className="size-7" />
              <span className="font-bold">Panel</span>
            </Link>
            {/* El correo es además el enlace para cambiar la contraseña de
                esta misma cuenta, que es donde uno lo busca. */}
            <Link
              href="/cuenta"
              title="Cambiar mi correo o contraseña"
              className="hidden rounded-full border border-line px-2.5 py-0.5 text-xs text-muted transition-colors hover:border-flame-500/50 hover:text-ink sm:inline"
            >
              {admin.email}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/cuenta" className="text-sm text-muted hover:text-ink sm:hidden">
              Mi cuenta
            </Link>
            <Link href="/" className="text-sm text-muted hover:text-ink">
              Ver tienda ↗
            </Link>
          </div>
        </div>
        <AdminNav />
      </header>

      {/*
        La tienda pausada se avisa en TODAS las pantallas del panel, no solo en
        Configuración. El interruptor se usa cuando el proveedor se cae, y el
        riesgo real no es olvidarse de pausar: es olvidarse de reanudar y pasar
        el día sin vender creyendo que no entró nadie.
      */}
      {/*
        Un proveedor cortado por el fusible automático. Se avisa aunque no haga
        falta actuar —se reabre solo— porque explica por qué bajaron las ventas
        esta tarde sin que nadie tocara nada.
      */}
      {cortados.length > 0 && (
        <div className="border-b border-warn/40 bg-warn/15">
          <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm sm:px-6">
            {cortados.map((f) => (
              <p key={f.providerCode} className="text-warn">
                <span className="font-semibold">{f.providerCode}</span> está cortado
                automáticamente: no respondió {f.consecutiveFailures} veces seguidas. Sus recargas
                están pausadas y se reanudarán solas en cuanto vuelva a responder
                {f.proximaPrueba
                  ? ` (próxima comprobación ~${f.proximaPrueba.toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Lima",
                    })})`
                  : ""}
                . Los demás juegos siguen vendiendo.
              </p>
            ))}
          </div>
        </div>
      )}

      {!config.purchasesEnabled && (
        <div className="border-b border-danger/40 bg-danger/15">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-6">
            <span className="font-semibold text-danger">
              Las compras están PAUSADAS — nadie puede comprar en la tienda.
            </span>
            <Link href="/admin/configuracion" className="underline hover:text-ink">
              Reanudar
            </Link>
          </div>
        </div>
      )}

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
