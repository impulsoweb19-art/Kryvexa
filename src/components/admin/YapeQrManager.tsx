"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";

/**
 * Subir / restaurar el QR de Yape que ven los usuarios al recargar saldo.
 *
 * Va aparte del formulario de configuración porque es un archivo: se envía
 * como multipart y se guarda al instante, sin esperar a «Guardar cambios».
 */
export function YapeQrManager({ src, hasCustomQr }: { src: string; hasCustomQr: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState<"upload" | "reset" | null>(null);
  // Cambia al guardar para forzar que el navegador vuelva a pedir la imagen
  // en vez de mostrar la que tenía en caché.
  const [version, setVersion] = useState(0);

  async function upload(file: File) {
    setLoading("upload");
    setMessage(null);
    try {
      const body = new FormData();
      body.append("qr", file);
      const res = await fetch("/api/admin/settings/qr", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo subir el QR.");
      setMessage({ tone: "ok", text: "QR actualizado. Ya lo ven los usuarios." });
      setVersion((v) => v + 1);
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setLoading(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function reset() {
    setLoading("reset");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings/qr", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo restaurar el QR.");
      setMessage({ tone: "ok", text: "Se restauró el QR incluido en el proyecto." });
      setVersion((v) => v + 1);
      router.refresh();
    } catch (e) {
      setMessage({ tone: "danger", text: (e as Error).message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">QR de Yape</h2>
        <p className="mt-1 text-sm text-muted">
          Se muestra debajo del número, en la pantalla donde el usuario agrega saldo. Sube una
          captura del QR de la cuenta que va a recibir los pagos (JPG, PNG o WebP).
        </p>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${src}${src.includes("?") ? "&" : "?"}v=${version}`}
            alt="QR de Yape actual"
            className="h-auto w-40 rounded-lg bg-white"
          />
          <p className="mt-2 text-center text-xs text-faint">
            {hasCustomQr ? "QR subido por ti" : "QR incluido por defecto"}
          </p>
        </div>

        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={loading !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-flame-500/15 file:px-4 file:py-2 file:text-sm file:font-medium file:text-flame-400 hover:file:bg-flame-500/25"
          />
          <p className="text-xs text-faint">
            Al elegir el archivo se guarda solo. Máximo 5 MB.
          </p>

          {hasCustomQr && (
            <Button
              size="sm"
              variant="secondary"
              loading={loading === "reset"}
              disabled={loading !== null}
              onClick={reset}
            >
              Restaurar el QR incluido
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
