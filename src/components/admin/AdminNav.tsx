"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Resumen", exact: true },
  { href: "/admin/depositos", label: "Depósitos" },
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/catalogo", label: "Catálogo" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
      <ul className="flex min-w-max gap-1 pb-px">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cx(
                  "inline-block border-b-2 px-3.5 py-3 text-sm transition-colors",
                  active
                    ? "border-flame-500 text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
