"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input } from "@/components/ui";

/**
 * Resolución manual de un pedido atascado.
 *
 * Solo aparece en pedidos cuyo resultado el proveedor nunca confirmó. Es una
 * decisión humana y queda registrada en la auditoría con su nota.
 */
export function OrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState<"COMPLETED" | "REFUNDED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(resolution: "COMPLETED" | "REFUNDED") {
    setLoading(resolution);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, note: note || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo resolver el pedido.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Nota interna (qué comprobaste)"
          className="sm:w-72"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            loading={loading === "COMPLETED"}
            disabled={loading !== null}
            onClick={() => resolve("COMPLETED")}
          >
            Marcar entregado
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={loading === "REFUNDED"}
            disabled={loading !== null}
            onClick={() => resolve("REFUNDED")}
          >
            Devolver saldo
          </Button>
        </div>
      </div>
    </div>
  );
}
