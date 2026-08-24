"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validation";

/**
 * Formularios de acceso.
 *
 * La validación Zod se ejecuta aquí para dar feedback inmediato, pero el
 * servidor la repite entera: nada de lo que ocurra en este archivo es una
 * garantía de seguridad, solo de comodidad.
 */

type FieldErrors = Record<string, string>;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const fields = (json?.details?.fields ?? {}) as FieldErrors;
    throw Object.assign(new Error(json?.error ?? "No pudimos completar la solicitud."), { fields });
  }
  return json.data;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setMessage(null);

    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      await postJson("/api/auth/login", parsed.data);
      // Si llegó aquí porque quería entrar a una página protegida, se le
      // devuelve ahí (`?next=`). Si entró a iniciar sesión por su cuenta, va a
      // la portada: es donde elige el juego, no tiene por qué caer siempre en
      // Free Fire. Se comprueba que `next` sea una ruta interna para que un
      // enlace manipulado no pueda usar el login como salto a otro sitio.
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.push(safeNext);
      router.refresh();
    } catch (err) {
      const e2 = err as Error & { fields?: FieldErrors };
      setErrors(e2.fields ?? {});
      setMessage(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message && <Alert>{message}</Alert>}

      <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          aria-invalid={Boolean(errors.email)}
          required
        />
      </Field>

      <Field label="Contraseña" htmlFor="password" error={errors.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={Boolean(errors.password)}
          required
        />
      </Field>

      <p className="text-right text-sm">
        <Link href="/recuperar" className="text-muted hover:text-ink hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Entrar
      </Button>

      <p className="text-center text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-flame-400 hover:underline">
          Crear una
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setMessage(null);

    const form = new FormData(e.currentTarget);
    const parsed = registerSchema.safeParse({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      acceptTerms: form.get("acceptTerms") === "on",
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      await postJson("/api/auth/register", parsed.data);
      router.push("/billetera/recargar");
      router.refresh();
    } catch (err) {
      const e2 = err as Error & { fields?: FieldErrors };
      setErrors(e2.fields ?? {});
      setMessage(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {message && <Alert>{message}</Alert>}

      <Field label="Nombre" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" autoComplete="name" placeholder="Tu nombre" required />
      </Field>

      <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="tu@correo.com" required />
      </Field>

      <Field label="WhatsApp (opcional)" htmlFor="phone" hint="Solo para avisarte de tus depósitos." error={errors.phone}>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+51 999 999 999" />
      </Field>

      <Field
        label="Contraseña"
        htmlFor="password"
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        error={errors.password}
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>

      <Field label="Repite la contraseña" htmlFor="confirmPassword" error={errors.confirmPassword}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          name="acceptTerms"
          className="mt-0.5 size-4 rounded border-line bg-abyss accent-flame-500"
          required
        />
        <span>
          Acepto los términos del servicio y confirmo que los datos de recarga que ingrese son
          correctos.
        </span>
      </label>
      {errors.acceptTerms && <p className="text-xs text-danger">{errors.acceptTerms}</p>}

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Crear cuenta
      </Button>

      <p className="text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-flame-400 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

/**
 * "¿Olvidaste tu contraseña?": dos pasos en un solo componente.
 *
 * 1. Pide el correo y manda el código (siempre "éxito", exista o no la
 *    cuenta: ver `requestPasswordReset` en el servidor).
 * 2. Con el código + contraseña nueva, confirma el cambio.
 *
 * No pide la contraseña actual —es justo lo que el usuario no tiene— así que
 * la prueba de identidad es el código que le llega a SU correo.
 */
export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function onRequestCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setNotice(null);

    const form = new FormData(e.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({ email: String(form.get("email") ?? "") });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      await postJson("/api/auth/forgot-password", parsed.data);
      setEmail(parsed.data.email);
      setStep("confirm");
      setNotice({
        tone: "ok",
        text: "Si ese correo tiene una cuenta, te enviamos un código de verificación. Vence en 10 minutos.",
      });
      startCooldown();
    } catch (err) {
      setNotice({ tone: "danger", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setLoading(true);
    setNotice(null);
    try {
      await postJson("/api/auth/forgot-password", { email });
      setNotice({ tone: "ok", text: "Te enviamos otro código." });
      startCooldown();
    } catch (err) {
      setNotice({ tone: "danger", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setNotice(null);

    const form = new FormData(e.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      email,
      code: String(form.get("code") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
      confirmNewPassword: String(form.get("confirmNewPassword") ?? ""),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      await postJson("/api/auth/reset-password", parsed.data);
      router.push("/login?reset=1");
    } catch (err) {
      const e2 = err as Error & { fields?: FieldErrors };
      setErrors(e2.fields ?? {});
      setNotice({ tone: "danger", text: e2.message });
    } finally {
      setLoading(false);
    }
  }

  if (step === "request") {
    return (
      <form onSubmit={onRequestCode} className="space-y-4" noValidate>
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <p className="text-sm text-muted">
          Ingresa el correo con el que te registraste y te enviaremos un código para poner una
          contraseña nueva.
        </p>

        <Field label="Correo electrónico" htmlFor="email" error={errors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            aria-invalid={Boolean(errors.email)}
            required
          />
        </Field>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          Enviar código
        </Button>

        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-flame-400 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onConfirm} className="space-y-4" noValidate>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <p className="text-sm text-muted">
        Enviamos un código a <span className="font-medium text-ink">{email}</span>.
      </p>

      <Field label="Código de verificación" htmlFor="code" error={errors.code}>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          required
        />
      </Field>

      <Field
        label="Contraseña nueva"
        htmlFor="newPassword"
        hint="Mínimo 8 caracteres, con al menos una letra y un número."
        error={errors.newPassword}
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
      </Field>

      <Field label="Repite la contraseña nueva" htmlFor="confirmNewPassword" error={errors.confirmNewPassword}>
        <Input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" fullWidth size="lg" loading={loading}>
        Restablecer contraseña
      </Button>

      <p className="text-center text-sm text-muted">
        ¿No te llegó?{" "}
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || loading}
          className="font-medium text-flame-400 hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {cooldown > 0 ? `Reenviar (${cooldown}s)` : "Reenviar código"}
        </button>
      </p>
    </form>
  );
}
