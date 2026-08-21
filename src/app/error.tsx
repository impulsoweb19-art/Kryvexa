"use client";

import { Button } from "@/components/ui";

/**
 * Frontera de error global.
 *
 * Al usuario NUNCA se le muestra `error.message`: podría contener detalles de
 * la base de datos o del proveedor. Solo el `digest`, que sirve para localizar
 * la traza completa en los logs del servidor.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-black text-danger">!</p>
        <h1 className="mt-4 text-xl font-bold">Algo salió mal</h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Tuvimos un problema al cargar esta página. Tu saldo y tus pedidos no se han visto
          afectados.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-faint">Referencia: {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Reintentar</Button>
        </div>
      </div>
    </div>
  );
}
