import { cx } from "@/components/ui";

/**
 * Iconos de redes, dibujados como SVG inline.
 *
 * No se usan imágenes ni una librería de iconos a propósito: son cuatro
 * trazos, heredan el color del texto y no añaden ni una petición de red.
 */

type IconProps = { className?: string };

export function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cx("size-5", className)} aria-hidden>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.42 1.31-1.96 1.36-.54.05-1.03.24-2.9-.61-2.25-1.03-3.68-3.4-3.79-3.55-.11-.15-.9-1.24-.9-2.37 0-1.13.58-1.68.79-1.91.2-.23.44-.29.59-.29.15 0 .3 0 .43.01.14.01.32-.05.5.39.19.44.63 1.55.69 1.66.06.11.09.24.02.39-.08.15-.11.24-.22.37-.11.13-.24.29-.34.39-.11.11-.23.23-.1.46.13.23.58.96 1.25 1.56.86.77 1.58 1.01 1.81 1.12.22.11.36.09.49-.06.13-.15.56-.66.71-.88.15-.22.3-.18.5-.11.2.07 1.29.61 1.51.72.22.11.37.17.43.26.05.1.05.57-.19 1.25Z" />
    </svg>
  );
}

export function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={cx("size-5", className)} aria-hidden>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.85-2.48V9.79a5.68 5.68 0 1 0 4.94 5.63V8.87a7.35 7.35 0 0 0 4.3 1.38V7.16a4.29 4.29 0 0 1-3.24-1.34Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cx("size-5", className)} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="12" cy="12" r="3.8" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
    </svg>
  );
}
