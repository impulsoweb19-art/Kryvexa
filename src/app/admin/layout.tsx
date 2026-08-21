import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/guards";

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
  const admin = await requireAdminPage();

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

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
