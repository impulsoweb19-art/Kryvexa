"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { sugerirCorreo } from "@/lib/email-typos";

/**
 * Suspender/reactivar una cuenta y corregirle el correo.
 *
 * Suspender revoca TODAS las sesiones al instante. Corregir el correo no: a
 * nadie hay que echarlo de su cuenta por arreglarle una errata.
 */
export function UserActions({
  userId,
  status,
  email,
}: {
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
  email: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [correo, setCorreo] = useState(email);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";

  /** El mismo detector que ve el comprador al registrarse. */
  const sugerencia = sugerirCorreo(correo);

  async function guardarCorreo() {
    setGuardando(true);
    setError(null);
    setListo(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: correo.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo cambiar el correo.");
      setListo("Correo corregido.");
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

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
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditando((v) => !v)}>
          {editando ? "Cancelar" : "Corregir correo"}
        </Button>
        <Button
          size="sm"
          variant={status === "ACTIVE" ? "danger" : "success"}
          loading={loading}
          onClick={toggle}
        >
          {status === "ACTIVE" ? "Suspender" : "Reactivar"}
        </Button>
      </div>

      {editando && (
        <div className="mt-2 space-y-2 text-left">
          <Input
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            inputMode="email"
            placeholder="correo@gmail.com"
          />
          {sugerencia && (
            <button
              type="button"
              onClick={() => setCorreo(sugerencia)}
              className="block text-xs text-warn underline underline-offset-2"
            >
              ¿Quisiste decir {sugerencia}?
            </button>
          )}
          <p className="text-xs text-faint">
            Úsalo solo para arreglar una errata. La persona no pierde su saldo ni su sesión, y el
            cambio queda registrado.
          </p>
          <Button
            size="sm"
            loading={guardando}
            disabled={correo.trim() === email || correo.trim() === ""}
            onClick={guardarCorreo}
          >
            Guardar correo
          </Button>
        </div>
      )}

      {listo && <p className="mt-1 text-xs text-ok">{listo}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
