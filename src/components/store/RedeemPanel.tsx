"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert, Button, Field, Input } from "@/components/ui";

/**
 * Canje de un código promocional, en dos pasos.
 *
 * Primero el código y solo después el ID de jugador, tal como lo pidió el
 * dueño del negocio: no tiene sentido hacer que alguien escriba su ID para
 * luego decirle que el código no servía. El código se reclama recién al
 * enviar el formulario completo —reservarlo en el primer paso permitiría que
 * alguien lo bloqueara sin llegar a canjearlo nunca.
 */
export function RedeemPanel() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [step, setStep] = useState<"code" | "player">("code");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ prize: string; orderCode: string } | null>(null);

  function continuar(e: FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4) return setError("Escribe tu código.");
    setError(null);
    setStep("player");
  }

  async function canjear(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId }),
      });
      const json = await res.json().catch(() => null);
      if (!json) throw new Error("No pudimos canjear el código. Inténtalo de nuevo.");
      if (!res.ok || !json.success) throw new Error(json.error ?? "No pudimos canjear el código.");

      setDone({ prize: json.data.prize, orderCode: json.data.orderCode });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      // Si el código ya no sirve, volver al primer paso: el ID no es el problema.
      if (/canjeado|no existe/i.test((err as Error).message)) setStep("code");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert tone="ok" title="¡Código canjeado!">
        Tu premio <strong>{done.prize}</strong> quedó registrado con el pedido{" "}
        <strong className="font-mono">{done.orderCode}</strong>. La entrega es manual: lo recibirás
        en tu cuenta en breve.{" "}
        <Link href="/pedidos" className="underline">
          Ver mis pedidos
        </Link>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}

      {step === "code" ? (
        <form onSubmit={continuar} className="space-y-5">
          <Field label="Código" htmlFor="code" hint="Por ejemplo: KRYV-7X92Q">
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="KRYV-XXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              className="font-mono tracking-widest"
            />
          </Field>
          <Button type="submit" fullWidth size="lg">
            Continuar
          </Button>
        </form>
      ) : (
        <form onSubmit={canjear} className="space-y-5">
          <div className="rounded-xl border border-line bg-abyss p-4">
            <span className="text-xs text-faint">Código</span>
            <p className="font-mono text-lg font-bold tracking-widest text-flame-400">{code}</p>
            <button
              type="button"
              onClick={() => setStep("code")}
              className="mt-1 text-xs text-muted underline hover:text-ink"
            >
              Cambiar
            </button>
          </div>

          <Field label="ID de jugador" htmlFor="playerId" hint="A esta cuenta se entregará el premio.">
            <Input
              id="playerId"
              inputMode="numeric"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              placeholder="Solo números"
              autoComplete="off"
            />
          </Field>

          <Button type="submit" fullWidth size="lg" loading={loading} disabled={playerId.trim().length < 3}>
            Canjear premio
          </Button>

          <p className="text-center text-xs text-faint">
            Revisa bien tu ID: el premio se entrega a la cuenta que indiques.
          </p>
        </form>
      )}
    </div>
  );
}
