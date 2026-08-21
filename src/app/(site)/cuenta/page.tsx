import type { Metadata } from "next";
import Link from "next/link";
import { AccountForm } from "@/components/auth/AccountForm";
import { requireUserPage } from "@/lib/guards";

export const metadata: Metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUserPage("/cuenta");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Volver al inicio
      </Link>

      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Mi cuenta</h1>
      <p className="mt-2 text-sm text-muted">
        Cambia tu nombre, tu correo de acceso o tu contraseña.
      </p>

      <div className="mt-8">
        <AccountForm initial={{ name: user.name, email: user.email, role: user.role }} />
      </div>
    </div>
  );
}
