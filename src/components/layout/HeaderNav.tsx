"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cx } from "@/components/ui";
import { formatPEN } from "@/lib/money";

export interface NavUser {
  name: string;
  role: "USER" | "ADMIN";
  balanceCents: number;
}

/**
 * No hay enlace directo a «Tienda» a propósito.
 *
 * La tienda es la de UN juego concreto; a ella se entra eligiendo el juego en
 * la portada. Un botón «Tienda» en la cabecera se saltaría esa elección y
 * llevaría siempre a Free Fire, que dejaría de tener sentido en cuanto haya
 * un segundo juego. Para volver a elegir está el logo (lleva a la portada).
 */
const LINKS = [
  { href: "/billetera", label: "Billetera" },
  { href: "/pedidos", label: "Mis pedidos" },
  { href: "/cuenta", label: "Mi cuenta" },
];

export function HeaderNav({ user }: { user: NavUser | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const links = user ? LINKS : [];

  return (
    <>
      {/* Escritorio */}
      <nav className="hidden items-center gap-1 md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              pathname.startsWith(link.href) ? "bg-surface-2 text-ink" : "text-muted hover:text-ink",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="hidden items-center gap-3 md:flex">
        {user ? (
          <>
            <Link
              href="/billetera"
              className="rounded-xl border border-line bg-abyss px-3.5 py-2 text-sm font-semibold tabular-nums text-ok transition-colors hover:border-ok/40"
            >
              {formatPEN(user.balanceCents)}
            </Link>
            {user.role === "ADMIN" && (
              <Link href="/admin" className="text-sm text-plasma-400 hover:underline">
                Panel
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={logout}>
              Salir
            </Button>
          </>
        ) : (
          <>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Iniciar sesión
              </Button>
            </Link>
            <Link href="/registro">
              <Button size="sm">Crear cuenta</Button>
            </Link>
          </>
        )}
      </div>

      {/* Móvil */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Abrir menú"
        className="grid size-10 place-items-center rounded-xl border border-line bg-abyss md:hidden"
      >
        <span className="relative block h-3 w-4">
          <span
            className={cx(
              "absolute inset-x-0 top-0 h-0.5 rounded bg-ink transition-transform",
              open && "top-1.5 rotate-45",
            )}
          />
          <span
            className={cx("absolute inset-x-0 top-1.5 h-0.5 rounded bg-ink transition-opacity", open && "opacity-0")}
          />
          <span
            className={cx(
              "absolute inset-x-0 bottom-0 h-0.5 rounded bg-ink transition-transform",
              open && "bottom-1.5 -rotate-45",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 border-t border-line bg-abyss/98 p-4 backdrop-blur-xl md:hidden">
          {user ? (
            <div className="space-y-2">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <span className="text-sm text-muted">Saldo</span>
                <span className="font-semibold tabular-nums text-ok">{formatPEN(user.balanceCents)}</span>
              </div>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-sm hover:bg-surface-2"
                >
                  {link.label}
                </Link>
              ))}
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-sm text-plasma-400 hover:bg-surface-2"
                >
                  Panel de administración
                </Link>
              )}
              <Button variant="secondary" fullWidth onClick={logout}>
                Cerrar sesión
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link href="/login" onClick={() => setOpen(false)}>
                <Button variant="secondary" fullWidth>
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/registro" onClick={() => setOpen(false)}>
                <Button fullWidth>Crear cuenta</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
