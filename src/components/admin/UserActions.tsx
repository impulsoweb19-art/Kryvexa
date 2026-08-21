"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

/** Suspender o reactivar. Suspender revoca TODAS las sesiones al instante. */
export function UserActions({ userId, status }: { userId: string; status: "ACTIVE" | "SUSPENDED" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo actualizar.");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <Button
        size="sm"
        variant={status === "ACTIVE" ? "danger" : "success"}
        loading={loading}
        onClick={toggle}
      >
        {status === "ACTIVE" ? "Suspender" : "Reactivar"}
      </Button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
