import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import { ProductCard } from "@/components/store/ProductCard";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { isBloodStrikeProduct, listStoreProducts } from "@/server/services/catalog";
import { getBalance } from "@/server/services/wallet";

export const metadata: Metadata = { title: "Blood Strike" };
export const dynamic = "force-dynamic";

/**
 * Tienda de Blood Strike.
 *
 * A diferencia de Free Fire y Mobile Legends, aquí TODO es de entrega manual:
 * no hay proveedor conectado, el dueño activa cada compra a mano. Por eso el
 * texto lo dice desde el principio en vez de dejar creer que llega al
 * instante — prometer inmediatez y tardar diez minutos genera más reclamos
 * que avisarlo de entrada.
 */
export default async function BloodStrikeStorePage() {
  const user = await requireUserPage("/tienda/blood-strike");
  const [products, balance] = await Promise.all([
    listStoreProducts(isBloodStrikeProduct).catch(() => []),
    getBalance(user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/#elige-juego" className="text-sm text-muted hover:text-ink">
            ← Cambiar de juego
          </Link>
          <h1 className="mt-3 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
            Tu Oro y tus Pases,{" "}
            <span className="text-gradient-flame">sin complicaciones.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Elige tu paquete, ingresa tu ID de jugador y confirma. La entrega de Blood Strike la
            hacemos a mano: suele tardar pocos minutos en horario de atención.
          </p>
        </div>
        <Link href="/billetera/recargar">
          <Button variant="secondary">
            Saldo:{" "}
            <span className="ml-1.5 font-bold tabular-nums text-ok">
              {formatPEN(balance.balanceCents)}
            </span>
          </Button>
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Todavía no hay productos"
            description="Estamos cargando los paquetes de Blood Strike. Vuelve en un rato o escríbenos por soporte."
          />
        </div>
      ) : (
        <section className="mt-10">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} balanceCents={balance.balanceCents} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
