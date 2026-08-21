import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { HeaderNav } from "./HeaderNav";
import { getCurrentUser } from "@/lib/session";
import { getBalance } from "@/server/services/wallet";
import { getConfig } from "@/server/services/settings";

/**
 * Cabecera. Componente de servidor: lee la sesión y el saldo sin exponer
 * ningún endpoint extra ni provocar un parpadeo de "cargando" en el cliente.
 */
export async function SiteHeader() {
  const [user, config] = await Promise.all([getCurrentUser(), getConfig()]);
  const balance = user ? await getBalance(user.id) : null;

  return (
    <header className="relative z-40 border-b border-line-soft bg-void/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo name={config.storeName || "KRYVEXA"} />
        </Link>
        <HeaderNav
          user={
            user
              ? { name: user.name, role: user.role, balanceCents: balance?.balanceCents ?? 0 }
              : null
          }
        />
      </div>
    </header>
  );
}
