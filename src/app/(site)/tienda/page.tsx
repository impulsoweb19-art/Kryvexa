import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import { CategoryCard, ProductCard } from "@/components/store/ProductCard";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { categoryOf, type StoreCategory } from "@/lib/store-categories";
import { isFreeFireProduct, listStoreProducts, type StoreProduct } from "@/server/services/catalog";
import { getBalance } from "@/server/services/wallet";

export const metadata: Metadata = { title: "Tienda" };
export const dynamic = "force-dynamic";

type Entry =
  | { kind: "product"; product: StoreProduct }
  | { kind: "category"; category: StoreCategory; items: StoreProduct[] };

/**
 * Convierte la lista plana de productos en lo que se pinta: cada producto
 * suelto va como está, y los de una misma familia colapsan en una sola
 * entrada, en la posición donde aparecía el primero de ellos (así se respeta
 * el orden que el administrador configuró).
 */
function entriesOf(items: StoreProduct[]): Entry[] {
  const entries: Entry[] = [];
  const porCategoria = new Map<string, Extract<Entry, { kind: "category" }>>();

  for (const product of items) {
    const category = categoryOf(product);
    if (!category) {
      entries.push({ kind: "product", product });
      continue;
    }

    const existente = porCategoria.get(category.slug);
    if (existente) {
      existente.items.push(product);
      continue;
    }

    const entrada: Extract<Entry, { kind: "category" }> = { kind: "category", category, items: [product] };
    porCategoria.set(category.slug, entrada);
    entries.push(entrada);
  }

  return entries;
}

export default async function StorePage() {
  const user = await requireUserPage("/tienda");
  const [products, balance] = await Promise.all([
    // Ahora que hay más de un juego en el catálogo, esta página se queda
    // explícitamente con Free Fire (RecargasAmérica + lo de entrega manual
    // que sea de este juego). Mobile Legends vive en /tienda/mobile-legends.
    listStoreProducts(isFreeFireProduct).catch(() => []),
    getBalance(user.id),
  ]);

  const grouped = products.reduce<Record<string, StoreProduct[]>>((acc, p) => {
    (acc[p.gameName] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/*
        Aquí SÍ se habla de diamantes: el cliente ya eligió Free Fire en la
        portada, así que el mensaje puede ser específico del juego. La portada
        mantiene un texto general porque cubre toda la tienda.
      */}
      <div className="rise rise-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/#elige-juego" className="text-sm text-muted hover:text-ink">
            ← Cambiar de juego
          </Link>
          <h1 className="mt-3 text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
            Tus diamantes,{" "}
            <span className="text-gradient-flame">en segundos.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Elige tu paquete, ingresa tu ID de jugador y confirma. Los precios ya incluyen todo y
            se descuentan de tu saldo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tienda/canjear">
            <Button variant="secondary">Canjear código</Button>
          </Link>
          <Link href="/billetera/recargar">
            <Button variant="secondary">
              Saldo:{" "}
              <span className="ml-1.5 font-bold tabular-nums text-ok">
                {formatPEN(balance.balanceCents)}
              </span>
            </Button>
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Todavía no hay productos"
            description="El catálogo se sincroniza con el proveedor. Vuelve en unos minutos o avísanos por soporte."
          />
        </div>
      ) : (
        Object.entries(grouped).map(([game, items]) => (
          <section key={game} className="mt-10">
            <h2 className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-faint">
              {game}
              <span className="h-px flex-1 bg-line-soft" />
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {/*
                Las familias largas (Cajas y Fragmentos Evo) se muestran como
                UNA casilla que lleva a sus paquetes; el resto de productos se
                listan tal cual. Ver `lib/store-categories`.
              */}
              {entriesOf(items).map((entry, i) =>
                entry.kind === "product" ? (
                  <ProductCard
                    key={entry.product.id}
                    product={entry.product}
                    balanceCents={balance.balanceCents}
                    index={i}
                  />
                ) : (
                  <CategoryCard
                    key={entry.category.slug}
                    title={entry.category.title}
                    description={entry.category.description}
                    href={`/tienda/categoria/${entry.category.slug}`}
                    imageUrl={entry.items[0].imageUrl}
                    fromPriceCents={Math.min(...entry.items.map((p) => p.priceCents))}
                    count={entry.items.length}
                    index={i}
                  />
                ),
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
