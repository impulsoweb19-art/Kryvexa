import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { LoginForm } from "@/components/auth/AuthForms";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getCurrentUser()) redirect("/tienda");
  const { reset } = await searchParams;

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rise rise-1">
        <h1 className="text-2xl font-bold">Bienvenido de vuelta</h1>
        <p className="mt-2 text-sm text-muted">Entra para ver tu saldo y comprar tus recargas.</p>
      </div>
      {reset === "1" && (
        <div className="mt-6 rise rise-2">
          <Alert tone="ok">Tu contraseña se actualizó. Inicia sesión con la nueva.</Alert>
        </div>
      )}
      <Card className="mt-6 rise rise-2">
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </Card>
    </div>
  );
}
