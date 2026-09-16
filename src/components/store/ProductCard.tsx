import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import type { StoreProduct } from "@/server/services/catalog";

/**
 * Tarjeta de producto de la tienda.
 *
 * Vive aparte porque la usan dos pantallas —el listado del juego y el de una
 * categoría— y tenerla duplicada hacía que cualquier retoque visual hubiera
 * que hacerlo dos veces, con el riesgo de que se vieran distintas.
 */
export function ProductCard({
  product,
  balanceCents,
  index = 0,
}: {
  product: StoreProduct;
  balanceCents: number;
  index?: number;
}) {
  const affordable = balanceCents >= product.priceCents;

  return (
    <Link
      href={`/tienda/${product.id}`}
      className={`panel group flex flex-col justify-between overflow-hidden transition-all hover:-translate-y-0.5 hover:border-flame-500/50 rise rise-${(index % 4) + 1}`}
    >
      <div className="shrink-0 p-3 pb-0 sm:p-4 sm:pb-0">
        <div className="line-border">
          <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-abyss">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt=""
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight sm:text-lg">{product.packageName}</h3>
          {product.validationSupported && <Badge tone="info">ID verificable</Badge>}
        </div>

        <div className="mt-4 flex flex-col items-start gap-2 sm:mt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div>
            <span className="block text-xl font-black tabular-nums text-flame-400 sm:text-2xl">
              {formatPEN(product.priceCents)}
            </span>
            {!affordable && <span className="text-xs text-warn">Saldo insuficiente</span>}
          </div>
          <span className="rounded-lg border-2 border-[#ff2d2d] px-3 py-2 text-sm font-semibold text-ink shadow-[0_0_10px_1px_rgb(255_45_45_/_0.6)]">
            Comprar →
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * Tarjeta de una familia de productos (Cajas Evo, Fragmentos Evo…).
 *
 * Ocupa el lugar de una tarjeta de producto y lleva a la pantalla donde están
 * los paquetes. Muestra el precio más bajo para que se entienda desde cuánto
 * arranca sin tener que entrar.
 */
export function CategoryCard({
  title,
  description,
  href,
  imageUrl,
  fromPriceCents,
  count,
  index = 0,
}: {
  title: string;
  description: string;
  href: string;
  imageUrl: string;
  fromPriceCents: number;
  count: number;
  index?: number;
}) {
  return (
    <Link
      href={href}
      className={`panel group flex flex-col justify-between overflow-hidden transition-all hover:-translate-y-0.5 hover:border-flame-500/50 rise rise-${(index % 4) + 1}`}
    >
      <div className="shrink-0 p-3 pb-0 sm:p-4 sm:pb-0">
        <div className="line-border">
          <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-abyss">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-tight sm:text-lg">{title}</h3>
          <Badge tone="info">{count} opciones</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{description}</p>

        <div className="mt-4 flex flex-col items-start gap-2 sm:mt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div>
            <span className="block text-xs text-faint">Desde</span>
            <span className="block text-xl font-black tabular-nums text-flame-400 sm:text-2xl">
              {formatPEN(fromPriceCents)}
            </span>
          </div>
          <span className="rounded-lg border-2 border-[#ff2d2d] px-3 py-2 text-sm font-semibold text-ink shadow-[0_0_10px_1px_rgb(255_45_45_/_0.6)]">
            Ver paquetes →
          </span>
        </div>
      </div>
    </Link>
  );
}
