import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { RegisterForm } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Crear cuenta" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/tienda");

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rise rise-1">
        <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
        <p className="mt-2 text-sm text-muted">
          Es gratis. Después podrás cargar saldo por Yape y comprar en dos toques.
        </p>
      </div>
      <Card className="mt-6 rise rise-2">
        <RegisterForm />
      </Card>
    </div>
  );
}
