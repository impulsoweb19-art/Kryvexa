"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { accountSchema } from "@/lib/validation";

/**
 * Formulario de "Mi cuenta".
 *
 * La contraseña actual se pide siempre, aunque solo se cambie el nombre: es lo
 * que evita que alguien que encuentre una sesión abierta se apropie de la
 * cuenta cambiando el correo. La validación se repite entera en el servidor;
 * lo de aquí es solo para avisar rápido.
 */
export function AccountForm({
  initial,
}: {
  initial: { name: string; email: string; role: "USER" | "ADMIN" };
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  async function onSendCode() {
    setSendingCode(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/account/verification-code", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "No pudimos enviar el código.");
      }
      setMessage({
        tone: "ok",
        text: "Te enviamos un código de verificación a tu correo. Vence en 10 minutos.",
      });
      setCodeCooldown(60);
      const interval = setInterval(() => {
        setCodeCooldown((s) => {
          if (s <= 1) {
            clearInterval(interval);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setSendingCode(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setMessage(null);

    const form = new FormData(e.currentTarget);
    const parsed = accountSchema.safeParse({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      confirmNewPassword: String(form.get("confirmNewPassword") ?? ""),
      verificationCode: String(form.get("verificationCode") ?? ""),
    });

    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErrors((json?.details?.fields ?? {}) as Record<string, string>);
        throw new Error(json?.error ?? "No pudimos guardar los cambios.");
      }

      setMessage({
        tone: "ok",
        text: json.data.passwordChanged
          ? "Datos guardados. Tu contraseña cambió y se cerraron las demás sesiones."
          : "Datos guardados.",
      });
      // Limpia los campos de contraseña; los de nombre y correo se quedan.
      e.currentTarget.reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Tus datos</h2>
          <p className="mt-1 text-sm text-muted">
            El correo es con el que inicias sesión.
            {initial.role === "ADMIN" && " Esta es la cuenta de administrador de la tienda."}
          </p>
        </div>

        <Field label="Nombre" htmlFor="name" error={errors.name}>
          <Input id="name" name="name" defaultValue={initial.name} autoComplete="name" />
        </Field>

        <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={initial.email}
            autoComplete="email"
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-bold">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-muted">
            Déjalo vacío si solo quieres cambiar el nombre o el correo. Al cambiarla se cierran las
            sesiones abiertas en otros dispositivos.
          </p>
        </div>

        <Field
          label="Contraseña nueva"
          htmlFor="newPassword"
          hint="Mínimo 8 caracteres, con al menos una letra y un número."
          error={errors.newPassword}
        >
          <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
        </Field>

        <Field label="Repite la contraseña nueva" htmlFor="confirmNewPassword" error={errors.confirmNewPassword}>
          <Input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
          />
        </Field>

        <Field
          label="Código de verificación"
          htmlFor="verificationCode"
          hint="Solo si vas a cambiar la contraseña: te lo enviamos por correo."
          error={errors.verificationCode}
        >
          <div className="flex gap-2">
            <Input
              id="verificationCode"
              name="verificationCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onSendCode}
              loading={sendingCode}
              disabled={codeCooldown > 0}
            >
              {codeCooldown > 0 ? `Reenviar (${codeCooldown}s)` : "Enviar código"}
            </Button>
          </div>
        </Field>
      </Card>

      <Card className="space-y-4 border-flame-500/30">
        <div>
          <h2 className="font-bold">Confirma que eres tú</h2>
          <p className="mt-1 text-sm text-muted">
            Escribe tu contraseña actual para guardar cualquier cambio.
          </p>
        </div>

        <Field label="Contraseña actual" htmlFor="currentPassword" error={errors.currentPassword}>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={loading}>
            Guardar cambios
          </Button>
        </div>
      </Card>
    </form>
  );
}
