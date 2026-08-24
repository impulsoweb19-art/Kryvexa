import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { PurchasePanel } from "@/components/store/PurchasePanel";
import { requireUserPage } from "@/lib/guards";
import { getProductById, productImageUrl, sellPriceCents } from "@/server/services/catalog";
import { getConfig } from "@/server/services/settings";
import { getBalance } from "@/server/services/wallet";
import type { ProviderInputField } from "@/server/providers/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id).catch(() => null);
  return { title: product ? `${product.packageName} — ${product.gameName}` : "Producto" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/tienda/${id}`);

  const [product, config] = await Promise.all([getProductById(id), getConfig()]);
  if (!product || !product.visible || !product.active) notFound();

  const balance = await getBalance(user.id);
  const priceCents = sellPriceCents(product, config);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/tienda" className="text-sm text-muted hover:text-ink">
        ← Volver a la tienda
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="rise rise-1 space-y-4">
          <Card>
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productImageUrl(product)}
                alt=""
                className="size-16 shrink-0 rounded-xl border border-line-soft bg-surface-2 object-cover sm:size-20"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-faint">
                  {product.gameName}
                </p>
                <h1 className="mt-1.5 text-2xl font-black sm:text-3xl">{product.packageName}</h1>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="info">Entrega automática</Badge>
              {product.validationSupported ? (
                <Badge tone="ok">ID verificable antes de pagar</Badge>
              ) : (
                <Badge tone="warn">Revisa bien tu ID</Badge>
              )}
            </div>

            <dl className="mt-6 space-y-3 border-t border-line-soft pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Datos requeridos</dt>
                <dd className="text-right font-medium">
                  {((product.inputFields as ProviderInputField[]) ?? [])
                    .map((f) => f.label)
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Reembolso automático</dt>
                <dd className="font-medium text-ok">Sí, si falla la entrega</dd>
              </div>
            </dl>
          </Card>

          <Card className="text-sm leading-relaxed text-muted">
            <p className="mb-2 font-semibold text-ink">Antes de comprar</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Verifica que el ID de jugador sea el de la cuenta que quieres recargar.</li>
              <li>El saldo se descuenta al confirmar y se devuelve si la recarga no se completa.</li>
              <li>Si el pedido queda «en proceso», no vuelvas a comprar: espera la confirmación.</li>
            </ul>
          </Card>
        </div>

        <Card className="rise rise-2 h-fit">
          <h2 className="mb-5 text-lg font-bold">Completa tu recarga</h2>
          <PurchasePanel
            product={{
              id: product.id,
              gameName: product.gameName,
              packageName: product.packageName,
              priceCents,
              inputFields: (product.inputFields as ProviderInputField[]) ?? [],
              validationSupported: product.validationSupported,
            }}
            balanceCents={balance.balanceCents}
          />
        </Card>
      </div>
    </div>
  );
}
