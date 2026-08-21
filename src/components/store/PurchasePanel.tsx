"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Field, Input, ORDER_STATUS_META } from "@/components/ui";
import { formatPEN } from "@/lib/money";

/**
 * Panel de compra.
 *
 * Puntos delicados resueltos aquí:
 *
 *  · DOBLE CLIC. Se genera un `idempotencyKey` (UUID) por intento y se mantiene
 *    mientras la petición está en vuelo. El botón se bloquea, pero lo que de
 *    verdad protege es la clave: el servidor tiene un índice UNIQUE sobre ella,
 *    así que dos envíos idénticos producen UNA sola orden.
 *
 *  · VALIDACIÓN DEL ID. Si el producto la admite, es obligatoria antes de
 *    comprar. Si NO la admite (la API no ofrece precheck para los paquetes de
 *    /products/games), se exige una confirmación explícita del usuario en vez
 *    de fingir una verificación que no existe.
 *
 *  · ÓRDENES PENDIENTES. Nunca se dice "listo" por un HTTP 200. Si la orden
 *    queda PENDING se sondea su estado real hasta que se resuelve.
 */

interface InputField {
  name: string;
  label: string;
  type?: "text" | "number";
}

export interface PurchaseProduct {
  id: string;
  gameName: string;
  packageName: string;
  priceCents: number;
  inputFields: InputField[];
  validationSupported: boolean;
}

interface OrderView {
  id: string;
  code: string;
  status: keyof typeof ORDER_STATUS_META | string;
  failureMessage?: string | null;
  providerReference?: string | null;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TRIES = 24; // 2 minutos

export function PurchasePanel({
  product,
  balanceCents,
}: {
  product: PurchaseProduct;
  balanceCents: number;
}) {
  const router = useRouter();

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.inputFields.map((f) => [f.name, ""])),
  );
  const [validation, setValidation] = useState<{ valid: boolean; accountName: string | null } | null>(null);
  const [validating, setValidating] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [polling, setPolling] = useState(false);

  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const pollTries = useRef(0);

  const affordable = balanceCents >= product.priceCents;
  const filled = product.inputFields.every((f) => values[f.name]?.trim());
  const primaryField = product.inputFields[0]?.name;

  // Si el usuario cambia los datos, cualquier verificación previa deja de valer.
  function setField(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    setValidation(null);
    setAcknowledged(false);
    setError(null);
  }

  const canBuy =
    filled &&
    affordable &&
    !submitting &&
    !order &&
    (product.validationSupported ? validation?.valid === true : acknowledged);

  async function verify() {
    if (!primaryField) return;
    setValidating(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, accountId: values[primaryField] }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No pudimos verificar el ID.");
      setValidation({ valid: json.data.valid, accountName: json.data.accountName });
      if (!json.data.valid) setError("No encontramos una cuenta con ese ID. Revísalo e inténtalo de nuevo.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setValidating(false);
    }
  }

  const pollOrder = useCallback(async (orderId: string) => {
    const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json.success) return null;
    return json.data as OrderView;
  }, []);

  useEffect(() => {
    if (!order || !polling) return;
    if (order.status !== "PENDING" && order.status !== "PROCESSING") {
      setPolling(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      pollTries.current += 1;
      const updated = await pollOrder(order.id);
      if (updated) setOrder(updated);
      if (pollTries.current >= POLL_MAX_TRIES) setPolling(false);
    }, POLL_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [order, polling, pollOrder]);

  async function buy() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          inputs: values,
          expectedPriceCents: product.priceCents,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        // Clave nueva para el siguiente intento: el anterior no llegó a crearse.
        idempotencyKey.current = crypto.randomUUID();
        throw new Error(json.error ?? "No pudimos completar la compra.");
      }

      setOrder(json.data.order);
      pollTries.current = 0;
      if (json.data.order.status === "PENDING" || json.data.order.status === "PROCESSING") {
        setPolling(true);
      }
      router.refresh(); // actualiza el saldo de la cabecera
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Resultado ────────────────────────────────────────────────────────────
  if (order) {
    const meta = ORDER_STATUS_META[order.status] ?? { label: order.status, tone: "neutral" as const };
    const done = order.status === "COMPLETED";
    const pending = order.status === "PENDING" || order.status === "PROCESSING";

    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="font-mono text-xs text-faint">{order.code}</span>
        </div>

        {done && (
          <Alert tone="ok" title="¡Recarga enviada!">
            Tu paquete <strong>{product.packageName}</strong> fue procesado correctamente. Revisa tu
            cuenta del juego en unos segundos.
          </Alert>
        )}

        {pending && (
          <Alert tone="warn" title="Tu recarga está en proceso">
            El proveedor aún no confirma la entrega. Estamos consultando el estado automáticamente;
            no vuelvas a comprar. Si en unos minutos sigue así, quedará registrada para revisión y
            te devolveremos el saldo si no se completó.
          </Alert>
        )}

        {(order.status === "REFUNDED" || order.status === "FAILED") && (
          <Alert tone="info" title="No se pudo completar">
            {order.failureMessage ?? "El proveedor no pudo procesar la recarga."} Tu saldo fue
            devuelto íntegramente a tu billetera.
          </Alert>
        )}

        {order.status === "NEEDS_REVIEW" && (
          <Alert tone="danger" title="Necesitamos revisarla manualmente">
            No obtuvimos confirmación del proveedor. Un administrador la revisará; si no se entregó,
            se te devolverá el saldo.
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href="/pedidos">
            <Button variant="secondary">Ver mis pedidos</Button>
          </Link>
          <Link href="/tienda">
            <Button variant="ghost">Volver a la tienda</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Formulario ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {error && <Alert>{error}</Alert>}

      {product.inputFields.length === 0 && (
        <Alert tone="warn">
          Este producto no declara los datos que necesita el proveedor. Avísanos antes de comprar.
        </Alert>
      )}

      {product.inputFields.map((field) => (
        <Field key={field.name} label={field.label} htmlFor={field.name}>
          <Input
            id={field.name}
            name={field.name}
            inputMode={field.type === "number" ? "numeric" : "text"}
            value={values[field.name] ?? ""}
            onChange={(e) => setField(field.name, e.target.value)}
            placeholder={field.type === "number" ? "Solo números" : field.label}
            autoComplete="off"
          />
        </Field>
      ))}

      {/* Verificación real, cuando el proveedor la ofrece */}
      {product.validationSupported && (
        <div className="space-y-3">
          <Button variant="secondary" onClick={verify} loading={validating} disabled={!filled}>
            Verificar ID
          </Button>
          {validation?.valid && (
            <Alert tone="ok" title="Cuenta encontrada">
              Vas a recargar a <strong>{validation.accountName ?? "esta cuenta"}</strong>.
            </Alert>
          )}
        </div>
      )}

      {/* Sin verificación disponible: confirmación explícita, sin fingir nada */}
      {!product.validationSupported && filled && (
        <label className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-flame-500"
          />
          <span className="text-muted">
            Este paquete no permite verificar el ID antes de recargar. Confirmo que{" "}
            {product.inputFields.map((f) => (
              <strong key={f.name} className="text-ink">
                {f.label}: {values[f.name]}{" "}
              </strong>
            ))}
            son correctos. Las recargas enviadas a un ID equivocado no se pueden revertir.
          </span>
        </label>
      )}

      <div className="flex items-center justify-between border-t border-line-soft pt-4">
        <div>
          <p className="text-xs text-faint">Total a pagar</p>
          <p className="text-2xl font-black tabular-nums text-flame-400">
            {formatPEN(product.priceCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-faint">Tu saldo</p>
          <p className={`font-semibold tabular-nums ${affordable ? "text-ok" : "text-danger"}`}>
            {formatPEN(balanceCents)}
          </p>
        </div>
      </div>

      {!affordable ? (
        <Link href="/billetera/recargar" className="block">
          <Button fullWidth size="lg" variant="secondary">
            Agregar saldo para continuar
          </Button>
        </Link>
      ) : (
        <Button fullWidth size="lg" onClick={buy} loading={submitting} disabled={!canBuy}>
          Confirmar compra
        </Button>
      )}

      <p className="text-center text-xs text-faint">
        Al confirmar se descuenta el saldo. Si la recarga falla, se devuelve automáticamente.
      </p>
    </div>
  );
}
