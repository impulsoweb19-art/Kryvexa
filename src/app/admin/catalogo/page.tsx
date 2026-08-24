import { CatalogManager, type AdminProductRow } from "@/components/admin/CatalogManager";
import { listAllProducts, sellPriceCents } from "@/server/services/catalog";
import { getConfig } from "@/server/services/settings";
import type { ProviderInputField } from "@/server/providers/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminCatalogPage() {
  const [products, config] = await Promise.all([listAllProducts(), getConfig()]);

  const rows: AdminProductRow[] = products.map((p) => ({
    id: p.id,
    gameName: p.gameName,
    packageName: p.packageName,
    kind: p.kind,
    costUsdCents: p.costUsdCents,
    computedPriceCents: sellPriceCents(p, config),
    priceCents: p.priceCents,
    visible: p.visible,
    featured: p.featured,
    active: p.active,
    validationSupported: p.validationSupported,
    inputLabels: ((p.inputFields as ProviderInputField[]) ?? []).map((f) => f.label),
    hasImage: Boolean(p.imagePath),
  }));

  const lastSync = products
    .map((p) => p.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="mt-1 text-sm text-muted">
          Productos traídos del proveedor. Solo se importan los de Free Fire en esta versión.
        </p>
      </div>

      <CatalogManager
        products={rows}
        exchangeRate={config.exchangeRate}
        marginBps={config.marginBps}
        lastSync={lastSync ? dateFmt.format(lastSync) : null}
      />
    </div>
  );
}
