"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

/**
 * Generación de códigos de canje.
 *
 * Se generan en lote porque el uso real es un sorteo: "quiero 50 códigos de
 * 100 diamantes". Los códigos recién creados se muestran en un cuadro de
 * texto listo para copiar, ya que hay que repartirlos por fuera de la web.
 */
export function CodeGenerator() {
  const router = useRouter();
  const [prize, setPrize] = useState("");
  const [count, setCount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGenerated(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/redemption-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize, count: Number(count) || 1 }),
      });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error("No pudimos generar los códigos.");
      if (!res.ok || !json.success) throw new Error(json.error ?? "No pudimos generar los códigos.");

      setGenerated(json.data.codes);
      setCopied(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copiar() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="rise rise-1">
      <h2 className="text-lg font-bold">Generar códigos</h2>
      <p className="mt-1 text-sm text-muted">
        Cada código sirve una sola vez. Quien lo canjee te llegará como pedido de entrega manual
        con el premio indicado.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}

        <Field label="Premio" htmlFor="prize" hint="Lo que verás en el pedido. Ej: 100 diamantes">
          <Input
            id="prize"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="100 diamantes"
          />
        </Field>

        <Field label="Cuántos códigos" htmlFor="count" hint="Hasta 200 por lote.">
          <Input
            id="count"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        </Field>

        <Button type="submit" loading={loading} disabled={prize.trim().length < 3}>
          Generar
        </Button>
      </form>

      {generated && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {generated.length} {generated.length === 1 ? "código creado" : "códigos creados"}
            </h3>
            <Button variant="secondary" onClick={copiar}>
              {copied ? "¡Copiado!" : "Copiar todos"}
            </Button>
          </div>
          <textarea
            readOnly
            value={generated.join("\n")}
            rows={Math.min(10, generated.length + 1)}
            className="mt-3 w-full rounded-xl border border-line bg-abyss p-3 font-mono text-sm tracking-widest text-ink"
          />
          <p className="mt-2 text-xs text-faint">
            Cópialos ahora para repartirlos. Igual quedan listados abajo mientras nadie los canjee.
          </p>
        </div>
      )}
    </Card>
  );
}
