"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { settingsSchema } from "@/lib/validation";

export interface SettingsValues {
  storeName: string;
  yapeHolderName: string;
  yapePhone: string;
  yapeInstructions: string;
  supportWhatsapp: string;
  supportEmail: string;
  socialWhatsappChannel: string;
  socialTiktok: string;
  socialInstagram: string;
  exchangeRate: number;
  marginBps: number;
  minDepositCents: number;
  purchasesEnabled: boolean;
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [purchasesEnabled, setPurchasesEnabled] = useState(initial.purchasesEnabled);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setMessage(null);

    const form = new FormData(e.currentTarget);
    const parsed = settingsSchema.safeParse({
      storeName: String(form.get("storeName") ?? ""),
      yapeHolderName: String(form.get("yapeHolderName") ?? ""),
      yapePhone: String(form.get("yapePhone") ?? ""),
      yapeInstructions: String(form.get("yapeInstructions") ?? ""),
      supportWhatsapp: String(form.get("supportWhatsapp") ?? ""),
      supportEmail: String(form.get("supportEmail") ?? ""),
      socialWhatsappChannel: String(form.get("socialWhatsappChannel") ?? "").trim(),
      socialTiktok: String(form.get("socialTiktok") ?? "").trim(),
      socialInstagram: String(form.get("socialInstagram") ?? "").trim(),
      exchangeRate: Number(form.get("exchangeRate")),
      marginBps: Math.round(Number(form.get("marginPercent")) * 100),
      minDepositCents: Math.round(Number(form.get("minDeposit")) * 100),
      purchasesEnabled,
    });

    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "No se pudo guardar.");
      setMessage({ tone: "ok", text: "Configuración guardada." });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Card className="space-y-4">
        <h2 className="font-bold">Datos de Yape</h2>
        <p className="-mt-2 text-sm text-muted">
          Es lo que verá el usuario al pedir un depósito. Revísalo bien: aquí es donde le pides
          dinero.
        </p>

        <Field label="Titular de la cuenta" htmlFor="yapeHolderName" error={errors.yapeHolderName}>
          <Input id="yapeHolderName" name="yapeHolderName" defaultValue={initial.yapeHolderName} />
        </Field>

        <Field label="Número de Yape" htmlFor="yapePhone" error={errors.yapePhone}>
          <Input id="yapePhone" name="yapePhone" defaultValue={initial.yapePhone} placeholder="999 999 999" />
        </Field>

        <Field label="Instrucciones para el usuario" htmlFor="yapeInstructions" error={errors.yapeInstructions}>
          <textarea
            id="yapeInstructions"
            name="yapeInstructions"
            rows={3}
            defaultValue={initial.yapeInstructions}
            className="w-full rounded-xl border border-line bg-abyss px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-flame-500/70 focus:outline-none"
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Precios</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Tipo de cambio (S/ por US$)"
            htmlFor="exchangeRate"
            error={errors.exchangeRate}
            hint="Ponlo algo por encima del oficial."
          >
            <Input
              id="exchangeRate"
              name="exchangeRate"
              inputMode="decimal"
              defaultValue={initial.exchangeRate}
            />
          </Field>

          <Field label="Margen global (%)" htmlFor="marginPercent" error={errors.marginBps}>
            <Input
              id="marginPercent"
              name="marginPercent"
              inputMode="decimal"
              defaultValue={(initial.marginBps / 100).toFixed(2)}
            />
          </Field>

          <Field label="Depósito mínimo (S/)" htmlFor="minDeposit" error={errors.minDepositCents}>
            <Input
              id="minDeposit"
              name="minDeposit"
              inputMode="decimal"
              defaultValue={(initial.minDepositCents / 100).toFixed(2)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-line bg-abyss p-4">
          <input
            type="checkbox"
            checked={purchasesEnabled}
            onChange={(e) => setPurchasesEnabled(e.target.checked)}
            className="size-4 accent-flame-500"
          />
          <span className="text-sm">
            <strong className="block">Compras habilitadas</strong>
            <span className="text-muted">
              Desactívalo para pausar todas las compras sin apagar la tienda (interruptor de
              emergencia).
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Tienda y contacto</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre de la tienda" htmlFor="storeName" error={errors.storeName}>
            <Input id="storeName" name="storeName" defaultValue={initial.storeName} />
          </Field>
          <Field label="WhatsApp de soporte" htmlFor="supportWhatsapp" error={errors.supportWhatsapp}>
            <Input id="supportWhatsapp" name="supportWhatsapp" defaultValue={initial.supportWhatsapp} />
          </Field>
          <Field label="Correo de soporte" htmlFor="supportEmail" error={errors.supportEmail}>
            <Input id="supportEmail" name="supportEmail" type="email" defaultValue={initial.supportEmail} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-bold">Redes sociales</h2>
        <p className="-mt-2 text-sm text-muted">
          Aparecen en el pie de la página. Pega el enlace completo (con
          <code className="mx-1 text-plasma-400">https://</code>) o déjalo vacío para ocultar ese
          botón.
        </p>

        <Field
          label="Canal de difusión de WhatsApp"
          htmlFor="socialWhatsappChannel"
          hint="Es el botón verde grande del pie."
          error={errors.socialWhatsappChannel}
        >
          <Input
            id="socialWhatsappChannel"
            name="socialWhatsappChannel"
            defaultValue={initial.socialWhatsappChannel}
            placeholder="https://whatsapp.com/channel/..."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="TikTok" htmlFor="socialTiktok" error={errors.socialTiktok}>
            <Input
              id="socialTiktok"
              name="socialTiktok"
              defaultValue={initial.socialTiktok}
              placeholder="https://www.tiktok.com/@tucuenta"
            />
          </Field>
          <Field label="Instagram (opcional)" htmlFor="socialInstagram" error={errors.socialInstagram}>
            <Input
              id="socialInstagram"
              name="socialInstagram"
              defaultValue={initial.socialInstagram}
              placeholder="https://www.instagram.com/tucuenta"
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={loading}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
