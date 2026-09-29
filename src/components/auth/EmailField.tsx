"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { sugerirCorreo } from "@/lib/email-typos";

/**
 * Campo de correo con detección de erratas en el dominio.
 *
 * Se usa en los tres sitios donde una errata deja a alguien fuera: el
 * registro, la recuperación de contraseña y el cambio de correo de la cuenta.
 * El aviso NUNCA bloquea el envío; solo ofrece el correo corregido a un toque.
 * Ver `src/lib/email-typos.ts` para el porqué de no obligar un dominio fijo.
 *
 * El input es controlado para poder reescribirlo al aceptar la sugerencia,
 * pero conserva su `name`, así que sigue viajando en el FormData igual que
 * antes y ningún formulario tuvo que cambiar su forma de leerlo.
 */
export function EmailField({
  label = "Correo electrónico",
  hint,
  error,
  defaultValue = "",
  autoComplete = "email",
  required = true,
}: {
  label?: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  const [valor, setValor] = useState(defaultValue);
  const [descartada, setDescartada] = useState<string | null>(null);

  const sugerencia = sugerirCorreo(valor);
  const visible = sugerencia !== null && sugerencia !== descartada;

  return (
    <Field label={label} htmlFor="email" hint={hint} error={error}>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete={autoComplete}
        placeholder="tu@correo.com"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        aria-invalid={Boolean(error)}
        required={required}
      />

      {visible && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
          <span className="text-muted">¿Quisiste decir</span>
          <button
            type="button"
            onClick={() => {
              setValor(sugerencia);
              setDescartada(null);
            }}
            className="font-bold text-warn underline underline-offset-2 hover:text-ink"
          >
            {sugerencia}
          </button>
          <span className="text-muted">?</span>
          {/* Un dominio legítimo puede parecerse a uno popular. Siempre hay
              salida: se descarta y el aviso no vuelve para ese mismo correo. */}
          <button
            type="button"
            onClick={() => setDescartada(sugerencia)}
            className="ml-auto text-faint hover:text-muted"
          >
            No, está bien
          </button>
        </div>
      )}
    </Field>
  );
}
