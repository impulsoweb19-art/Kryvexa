"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input } from "@/components/ui";

/**
 * Aprobar / rechazar un depósito.
 *
 * El botón se bloquea mientras la petición está en vuelo, pero la garantía real
 * está en el servidor: el UPDATE lleva `WHERE status='PENDING'` y el abono usa
 * una clave de idempotencia. Dos administradores pulsando a la vez no pueden
 * acreditar el saldo dos veces.
 */
export function DepositActions({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "approve" | "reject") {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/deposits/${depositId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "approve" ? { action } : { action, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo completar la acción.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="w-full sm:w-auto">
      {error && (
        <div className="mb-2">
          <Alert>{error}</Alert>
        </div>
      )}

      {mode === "idle" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            loading={loading === "approve"}
            disabled={loading !== null}
            onClick={() => send("approve")}
          >
            Aprobar
          </Button>
          <Button size="sm" variant="danger" disabled={loading !== null} onClick={() => setMode("rejecting")}>
            Rechazar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo del rechazo (obligatorio)"
            className="sm:w-72"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={loading === "reject"}
              disabled={reason.trim().length < 3}
              onClick={() => send("reject")}
            >
              Confirmar rechazo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
