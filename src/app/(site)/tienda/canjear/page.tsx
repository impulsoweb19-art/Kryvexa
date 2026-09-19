import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { RedeemPanel } from "@/components/store/RedeemPanel";
import { requireUserPage } from "@/lib/guards";

export const metadata: Metadata = { title: "Canjear código" };
export const dynamic = "force-dynamic";

export default async function RedeemPage() {
  await requireUserPage("/tienda/canjear");

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/tienda" className="text-sm text-muted hover:text-ink">
        ← Volver a la tienda
      </Link>

      <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Canjear código</h1>
      <p className="mt-2 text-sm text-muted">
        Si ganaste un código en una promoción o sorteo, canjéalo aquí. Cada código sirve una sola
        vez.
      </p>

      <Card className="rise rise-1 mt-8">
        <RedeemPanel />
      </Card>
    </div>
  );
}
