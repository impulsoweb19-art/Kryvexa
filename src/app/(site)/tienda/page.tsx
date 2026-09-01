import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { requireUserPage } from "@/lib/guards";
import { listStoreProducts } from "@/server/services/catalog";
import { getBalance } from "@/server/services/wallet";

export const metadata: Metadata = { title: "Tienda" };
export const dynamic = "force-dynamic";

// Ahora que hay más de un juego en el catálogo, esta página se queda
// explícitamente con Free Fire (antes no hacía falta filtrar porque era lo
// único que existía). Mobile Legends vive en /tienda/mobile-legends.
const FREE_FIRE_FILTER = /free\s*fire/i;

export default async function StorePage() {
  const user = await requireUserPage("/tienda");
  const [products, balance] = await Promise.all([
    listStoreProducts(FREE_FIRE_FILTER).catch(() => []),
    getBalance(user.id),
  ]);

  type StoreProduct = (typeof products)[number];
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
        <Link href="/billetera/recargar">
          <Button variant="secondary">
            Saldo: <span className="ml-1.5 font-bold tabular-nums text-ok">{formatPEN(balance.balanceCents)}</span>
          </Button>
        </Link>
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
              {items.map((p, i) => {
                const affordable = balance.balanceCents >= p.priceCents;
                return (
                  <Link
                    key={p.id}
                    href={`/tienda/${p.id}`}
                    className={`panel group flex flex-col justify-between overflow-hidden transition-all hover:-translate-y-0.5 hover:border-flame-500/50 rise rise-${(i % 4) + 1}`}
                  >
                    <div className="shrink-0 p-3 pb-0 sm:p-4 sm:pb-0">
                      <div className="line-border">
                        <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-abyss">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                          />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold leading-tight sm:text-lg">{p.packageName}</h3>
                        {p.validationSupported && <Badge tone="info">ID verificable</Badge>}
                      </div>

                      <div className="mt-4 flex flex-col items-start gap-2 sm:mt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                        <div>
                          <span className="block text-xl font-black tabular-nums text-flame-400 sm:text-2xl">
                            {formatPEN(p.priceCents)}
                          </span>
                          {!affordable && (
                            <span className="text-xs text-warn">Saldo insuficiente</span>
                          )}
                        </div>
                        <span className="rounded-lg border-2 border-[#ff2d2d] px-3 py-2 text-sm font-semibold text-ink shadow-[0_0_10px_1px_rgb(255_45_45_/_0.6)]">
                          Comprar →
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
