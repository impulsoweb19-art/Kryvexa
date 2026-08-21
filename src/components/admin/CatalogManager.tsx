"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, Input, cx } from "@/components/ui";
import { formatPEN, formatUSD } from "@/lib/money";

export interface AdminProductRow {
  id: string;
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
}

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
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

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

      {products.length === 0 ? (
        <Card className="text-sm text-muted">
          No hay productos todavía. Pulsa «Sincronizar ahora».
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className={cx("py-4", !p.active && "opacity-60")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
