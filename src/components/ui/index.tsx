import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Componentes base del sistema de diseño.
 *
 * Sin librería de UI externa: son pocos, pequeños y controlamos exactamente el
 * marcado y la accesibilidad. No llevan "use client" para poder usarse tanto en
 * componentes de servidor como de cliente.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ── Botón ────────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-r from-flame-500 to-flame-400 text-void font-semibold hover:from-flame-400 hover:to-flame-400 shadow-[0_10px_30px_-12px_rgb(47_155_240_/_0.8)]",
  secondary: "bg-surface-2 text-ink border border-line hover:border-flame-500/60 hover:bg-surface",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20",
  success: "bg-ok/10 text-ok border border-ok/40 hover:bg-ok/20",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm rounded-lg gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-13 px-7 text-base rounded-xl gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      // `loading` deshabilita el botón: es la primera línea contra el doble clic
      // (la segunda, y la que de verdad manda, es la idempotencia del servidor).
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap transition-all duration-150",
        "disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98]",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin",
        className,
      )}
    />
  );
}

// ── Contenedores ─────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("panel p-5 sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <header className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-flame-400">{eyebrow}</p>
      )}
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p>}
    </header>
  );
}

// ── Insignias de estado ──────────────────────────────────────────────────────

type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  ok: "bg-ok/10 text-ok border-ok/30",
  warn: "bg-warn/10 text-warn border-warn/30",
  danger: "bg-danger/10 text-danger border-danger/30",
  info: "bg-plasma-500/10 text-plasma-400 border-plasma-500/30",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Mapa único estado → color/etiqueta, para que toda la app hable igual. */
export const ORDER_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "En proceso", tone: "warn" },
  PROCESSING: { label: "Procesando", tone: "warn" },
  COMPLETED: { label: "Completada", tone: "ok" },
  FAILED: { label: "Fallida", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  REFUNDED: { label: "Devuelta", tone: "info" },
  NEEDS_REVIEW: { label: "En revisión", tone: "danger" },
};

export const DEPOSIT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pendiente", tone: "warn" },
  APPROVED: { label: "Aprobado", tone: "ok" },
  REJECTED: { label: "Rechazado", tone: "danger" },
};

// ── Formularios ──────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-line bg-abyss px-3.5 py-2.5 text-sm text-ink placeholder:text-faint " +
  "transition-colors focus:border-flame-500/70 focus:outline-none focus:ring-2 focus:ring-flame-500/20 " +
  "disabled:opacity-50 aria-[invalid=true]:border-danger/70";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "appearance-none pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

// ── Mensajes ─────────────────────────────────────────────────────────────────

export function Alert({
  tone = "danger",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div role="alert" className={cx("rounded-xl border px-4 py-3 text-sm", TONES[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="opacity-90">{children}</div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl border border-line bg-abyss text-2xl">◎</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

// ── Métrica ──────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
      <p
        className={cx(
          "mt-2 text-2xl font-bold tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
