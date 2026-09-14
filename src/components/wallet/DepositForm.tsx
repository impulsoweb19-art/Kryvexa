"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Alert, Button, Field, Input, cx } from "@/components/ui";
import { formatPEN } from "@/lib/money";
import { compressImage } from "@/lib/image";

/**
 * Solicitud de depósito por Yape.
 *
 * El comprobante se envía como multipart. La validación de tipo y tamaño se
 * repite en el servidor leyendo los BYTES del archivo: lo que se comprueba aquí
 * es solo para no hacerle perder el viaje al usuario.
 */

const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000];
const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";

/**
 * 4 MB, por debajo del tope REAL de la plataforma (Vercel corta cualquier
 * petición de más de 4.5 MB antes de que llegue a nuestro código, así que
 * pasado ese punto es imposible responder un error con sentido). Las fotos
 * se comprimen antes de medirlas, así que este límite solo lo alcanzan los
 * PDF grandes.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/** Ni se intenta comprimir algo así de grande: primero se avisa. */
const ABSURDLY_LARGE_BYTES = 25 * 1024 * 1024;

export function DepositForm({ minDepositCents }: { minDepositCents: number }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [amountCents, setAmountCents] = useState<number>(QUICK_AMOUNTS[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; amountCents: number } | null>(null);
  const [loading, setLoading] = useState(false);

  function pickAmount(cents: number) {
    setAmountCents(cents);
    setCustomAmount("");
    setError(null);
  }

  function onCustom(value: string) {
    setCustomAmount(value);
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) setAmountCents(Math.round(parsed * 100));
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const original = fileInput.current?.files?.[0];
    if (!original) return setError("Adjunta la captura de tu pago.");
    if (original.size > ABSURDLY_LARGE_BYTES) {
      return setError("El archivo es demasiado pesado. Sube una captura de pantalla del pago.");
    }
    if (amountCents < minDepositCents) {
      return setError(`El monto mínimo es ${formatPEN(minDepositCents)}.`);
    }

    const body = new FormData(e.currentTarget);
    body.set("amountCents", String(amountCents));

    setLoading(true);
    try {
      // Una foto de cámara pesa varios MB y la plataforma corta la subida a
      // medias; comprimida entra sin problema. Por eso el tamaño se mide
      // DESPUÉS de comprimir, no antes.
      const file = await compressImage(original);
      if (file.size > MAX_BYTES) {
        throw new Error("El archivo supera los 4 MB. Sube una captura de pantalla o una imagen más liviana.");
      }
      body.set("receipt", file);

      let res: Response;
      try {
        res = await fetch("/api/deposits", { method: "POST", body });
      } catch {
        // Falla de red: el navegador dice "Failed to fetch", que no le sirve
        // de nada a quien está intentando recargar.
        throw new Error("No pudimos enviar el comprobante. Revisa tu conexión e inténtalo de nuevo.");
      }

      const json = await res.json().catch(() => null);
      if (!json) throw new Error("No pudimos enviar el comprobante. Inténtalo de nuevo en un momento.");
      if (!res.ok || !json.success) throw new Error(json.error ?? "No pudimos registrar tu solicitud.");

      setDone({ code: json.data.code, amountCents: json.data.amountCents });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert tone="ok" title="Solicitud enviada">
        Tu solicitud <strong className="font-mono">{done.code}</strong> por{" "}
        <strong>{formatPEN(done.amountCents)}</strong> quedó en revisión. En cuanto la aprobemos verás
        el saldo en tu billetera.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && <Alert>{error}</Alert>}

      <div>
        <p className="mb-2.5 text-sm font-medium">¿Cuánto quieres agregar?</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => pickAmount(cents)}
              className={cx(
                "rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition-colors",
                amountCents === cents && !customAmount
                  ? "border-flame-500 bg-flame-500/10 text-flame-400"
                  : "border-line bg-abyss text-muted hover:border-line hover:text-ink",
              )}
            >
              {formatPEN(cents)}
            </button>
          ))}
        </div>
      </div>

      <Field label="U otro monto (S/)" htmlFor="custom" hint={`Mínimo ${formatPEN(minDepositCents)}.`}>
        <Input
          id="custom"
          inputMode="decimal"
          placeholder="0.00"
          value={customAmount}
          onChange={(e) => onCustom(e.target.value)}
        />
      </Field>

      <Field
        label="Número de operación (opcional)"
        htmlFor="operationCode"
        hint="Ayuda a que la aprobación sea más rápida."
      >
        <Input id="operationCode" name="operationCode" placeholder="Ej. 01234567" />
      </Field>

      <Field
        label="Comprobante de pago"
        htmlFor="receipt"
        hint="JPG, PNG, WebP o PDF. Las fotos se comprimen solas antes de enviarse."
      >
        <input
          ref={fileInput}
          id="receipt"
          name="receipt"
          type="file"
          accept={ACCEPTED}
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full cursor-pointer rounded-xl border border-dashed border-line bg-abyss px-3.5 py-4 text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-ink hover:border-flame-500/50"
        />
      </Field>
      {fileName && <p className="-mt-3 text-xs text-ok">Adjunto: {fileName}</p>}

      <div className="rounded-xl border border-line bg-abyss p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Se acreditará</span>
          <span className="text-xl font-black tabular-nums text-ok">{formatPEN(amountCents)}</span>
        </div>
      </div>

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Enviar solicitud
      </Button>

      <p className="text-center text-xs text-faint">
        La acreditación es manual y la revisa una persona. Solo se aprueba si el monto coincide con
        el comprobante.
      </p>
    </form>
  );
}
