"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Input, cx } from "@/components/ui";
import { formatPEN, formatUSD } from "@/lib/money";

export interface AdminProductRow {
  id: string;
  providerCode: string;
  gameName: string;
  packageName: string;
  kind: string;
  costUsdCents: number;
  computedPriceCents: number;
  priceCents: number | null;
  visible: boolean;
  featured: boolean;
  active: boolean;
  validationSupported: boolean;
  inputLabels: string[];
  hasImage: boolean;
  imageUrl: string;
}

/**
 * Mismo criterio que `isFreeFireProduct`/`isMobileLegendsProduct` en
 * `server/services/catalog.ts`: por proveedor cuando es exclusivo de un
 * juego (confiable), y por `gameName` solo para "manual" (que sí puede
 * tener productos de varios juegos). No se importa desde ahí porque ese
 * archivo es server-only y este componente corre en el navegador.
 */
const GAME_TABS = [
  { key: "free-fire", label: "Free Fire", match: (p: AdminProductRow) =>
      p.providerCode === "recargas_america" || (p.providerCode === "manual" && /free\s*fire/i.test(p.gameName)) },
  { key: "mobile-legends", label: "Mobile Legends", match: (p: AdminProductRow) =>
      p.providerCode === "epinby" || (p.providerCode === "manual" && /mobile?\s*legends/i.test(p.gameName)) },
] as const;

export function CatalogManager({
  products,
  exchangeRate,
  marginBps,
  lastSync,
}: {
  products: AdminProductRow[];
  exchangeRate: number;
  marginBps: number;
  lastSync: string | null;
}) {
  const router = useRouter();
  const [gameTab, setGameTab] = useState<(typeof GAME_TABS)[number]["key"]>("free-fire");
  const activeMatch = GAME_TABS.find((t) => t.key === gameTab)!.match;
  const visibleProducts = products.filter(activeMatch);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [imageBusy, setImageBusy] = useState<string | null>(null);
  // Cambia por producto al subir/quitar una imagen, para forzar que el
  // navegador la vuelva a pedir en vez de mostrar la que tenía en caché.
  const [imageVersions, setImageVersions] = useState<Record<string, number>>({});

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/catalog", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo sincronizar.");
      setMessage({
        tone: "ok",
        text: `Sincronizado: ${json.data.created} nuevos, ${json.data.updated} actualizados, ${json.data.deactivated} desactivados, ${json.data.skipped} fuera de alcance.`,
      });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  async function patch(productId: string, body: Record<string, unknown>) {
    setBusy(productId);
    try {
      const res = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, ...body }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo actualizar.");
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function uploadImage(productId: string, file: File) {
    setImageBusy(productId);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("productId", productId);
      body.append("image", file);
      const res = await fetch("/api/admin/catalog/image", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo subir la imagen.");
      setImageVersions((v) => ({ ...v, [productId]: (v[productId] ?? 0) + 1 }));
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setImageBusy(null);
    }
  }

  async function clearImage(productId: string) {
    setImageBusy(productId);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/catalog/image?productId=${productId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo quitar la imagen.");
      setImageVersions((v) => ({ ...v, [productId]: (v[productId] ?? 0) + 1 }));
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setImageBusy(null);
    }
  }

  function savePrice(p: AdminProductRow) {
    const draft = priceDrafts[p.id];
    if (draft === undefined) return;
    if (draft.trim() === "") return patch(p.id, { priceCents: null }); // volver al cálculo automático
    const value = Number(draft.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      return setMessage({ tone: "danger", text: "Precio inválido." });
    }
    return patch(p.id, { priceCents: Math.round(value * 100) });
  }

  return (
    <div className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold">Sincronización con el proveedor</h2>
          <p className="mt-1 text-sm text-muted">
            Trae los paquetes desde <code className="text-plasma-400">/products/games</code> y{" "}
            <code className="text-plasma-400">/products/pins</code>. Tus ajustes de precio,
            visibilidad y orden se conservan.
          </p>
          <p className="mt-1 text-xs text-faint">
            Última sincronización: {lastSync ?? "nunca"}
          </p>
        </div>
        <Button onClick={sync} loading={syncing}>
          Sincronizar ahora
        </Button>
      </Card>

      <Card>
        <h2 className="font-bold">Cálculo de precios</h2>
        <p className="mt-1 text-sm text-muted">
          Precio automático = costo USD × <strong>{exchangeRate}</strong> × (1 +{" "}
          <strong>{(marginBps / 100).toFixed(2)}%</strong>), redondeado hacia arriba a S/ 0.10.
          Puedes fijar un precio manual por producto; deja el campo vacío para volver al automático.
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        {GAME_TABS.map((tab) => {
          const count = products.filter(tab.match).length;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGameTab(tab.key)}
              className={cx(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                gameTab === tab.key
                  ? "border-flame-500 bg-flame-500/10 text-flame-400"
                  : "border-line bg-abyss text-muted hover:border-line hover:text-ink",
              )}
            >
              {tab.label} <span className="tabular-nums opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {products.length === 0 ? (
        <Card className="text-sm text-muted">
          No hay productos todavía. Pulsa «Sincronizar ahora».
        </Card>
      ) : visibleProducts.length === 0 ? (
        <Card className="text-sm text-muted">No hay productos de este juego todavía.</Card>
      ) : (
        <div className="space-y-2">
          {visibleProducts.map((p) => (
            <Card key={p.id} className={cx("py-4", !p.active && "opacity-60")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex shrink-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${p.imageUrl}${p.imageUrl.includes("?") ? "&" : "?"}v=${imageVersions[p.id] ?? 0}`}
                      alt=""
                      className="size-14 shrink-0 rounded-lg border border-line-soft bg-surface-2 object-cover"
                    />
                    <div className="space-y-1">
                      <label className="block cursor-pointer text-xs font-medium text-flame-400 hover:underline">
                        {imageBusy === p.id ? "Subiendo…" : p.hasImage ? "Cambiar imagen" : "Subir imagen"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={imageBusy === p.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadImage(p.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {p.hasImage && (
                        <button
                          type="button"
                          disabled={imageBusy === p.id}
                          onClick={() => clearImage(p.id)}
                          className="block text-xs text-faint hover:text-danger disabled:opacity-50"
                        >
                          Quitar imagen
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.packageName}</span>
                    <Badge tone="neutral">{p.gameName}</Badge>
                    {!p.active && <Badge tone="danger">Retirado por el proveedor</Badge>}
                    {p.validationSupported ? (
                      <Badge tone="ok">Valida ID</Badge>
                    ) : (
                      <Badge tone="warn">Sin validación</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    Costo {formatUSD(p.costUsdCents)} · Campos: {p.inputLabels.join(", ") || "—"}
                  </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-faint">
                      {p.priceCents === null ? "Precio automático" : "Precio fijo"}
                    </p>
                    <p className="font-bold tabular-nums text-flame-400">
                      {formatPEN(p.computedPriceCents)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      className="w-28"
                      placeholder="Auto"
                      inputMode="decimal"
                      defaultValue={p.priceCents !== null ? (p.priceCents / 100).toFixed(2) : ""}
                      onChange={(e) => setPriceDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === p.id}
                      onClick={() => savePrice(p)}
                    >
                      Guardar
                    </Button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={p.visible}
                      onChange={(e) => patch(p.id, { visible: e.target.checked })}
                      className="size-4 accent-flame-500"
                    />
                    Visible
                  </label>

                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={p.featured}
                      onChange={(e) => patch(p.id, { featured: e.target.checked })}
                      className="size-4 accent-flame-500"
                    />
                    Destacado
                  </label>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
