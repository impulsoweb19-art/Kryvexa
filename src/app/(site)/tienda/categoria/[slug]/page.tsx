import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState } from "@/components/ui";
import { ProductCard } from "@/components/store/ProductCard";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { findCategory, STORE_CATEGORIES } from "@/lib/store-categories";
import { listStoreProducts } from "@/server/services/catalog";
import { getBalance } from "@/server/services/wallet";

export const dynamic = "force-dynamic";

/**
 * Paquetes de una familia (Cajas Evo, Fragmentos Evo…).
 *
 * La compra sigue ocurriendo en /tienda/[id], igual que para cualquier otro
 * producto: esta pantalla solo agrupa, no cambia nada del flujo de pago.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: findCategory(slug)?.title ?? "Tienda" };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();

  const user = await requireUserPage(`/tienda/categoria/${slug}`);
  const [items, balance] = await Promise.all([
    listStoreProducts((p) => category.matches(p)).catch(() => []),
    getBalance(user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/tienda" className="text-sm text-muted hover:text-ink">
            ← Volver a la tienda
          </Link>
          <h1 className="mt-3 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
            {category.title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            {category.description} Ingresa tu ID de jugador al confirmar; la entrega la hace el
            equipo a mano y suele tardar pocos minutos en horario de atención.
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

      {items.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Sin paquetes disponibles"
            description="Ahora mismo no hay paquetes de esta categoría a la venta. Vuelve más tarde o escríbenos por soporte."
          />
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {items.map((p, i) => (
            <ProductCard key={p.id} product={p} balanceCents={balance.balanceCents} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Las categorías son fijas y pocas: se pueden pre-generar todas. */
export function generateStaticParams() {
  return STORE_CATEGORIES.map((c) => ({ slug: c.slug }));
}
