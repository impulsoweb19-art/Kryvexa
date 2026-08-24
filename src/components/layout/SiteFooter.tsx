import Link from "next/link";
import { LogoMark, LogoMascot } from "@/components/brand/Logo";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "@/components/brand/SocialIcons";
import { getConfig } from "@/server/services/settings";

/**
 * Distintivos de confianza. Los iconos son SVG en lugar de emojis: un emoji se
 * dibuja con los colores de cada sistema operativo y rompería el tono naranja
 * del resto de la fila.
 */
const TRUST = [
  {
    label: "Entrega inmediata",
    path: "M20 6 9 17l-5-5",
  },
  {
    label: "Pago seguro",
    path: "M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z",
  },
  {
    label: "Soporte directo",
    path: "M21 12a8 8 0 1 1-3.2-6.4M21 4v5h-5",
  },
];

export async function SiteFooter() {
  const config = await getConfig();
  const year = new Date().getFullYear();
  const name = config.storeName || "KRYVEXA";

  // Iconos pequeños: solo se pintan los que tienen enlace configurado.
  const smallSocials = [
    { href: config.socialTiktok, label: "TikTok", Icon: TikTokIcon, hover: "hover:border-ink/40 hover:text-ink" },
    {
      href: config.socialInstagram,
      label: "Instagram",
      Icon: InstagramIcon,
      hover: "hover:border-[#e1306c]/60 hover:text-[#f26aa0]",
    },
  ].filter((s) => Boolean(s.href));

  const hasSocials = Boolean(config.socialWhatsappChannel) || smallSocials.length > 0;

  return (
    <footer className="relative z-10 mt-24 border-t border-flame-500/25 bg-abyss/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr]">
        {/* ── Marca ────────────────────────────────────────────────────── */}
        <div>
          <LogoMascot className="h-20 -ml-2" />

          <div className="mt-2 flex items-center gap-2.5">
            <LogoMark className="size-10" />
            <span className="text-lg font-bold tracking-tight">
              {name.length > 3 ? name.slice(0, -3) : name}
              <span className="text-plasma-400">{name.length > 3 ? name.slice(-3) : ""}</span>
            </span>
          </div>

          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Tu tienda de recargas de confianza.
            <br />
            Diamantes, pases y más — al instante y con los mejores precios.
          </p>

          <ul className="mt-5 flex flex-wrap gap-1.5">
            {TRUST.map((t) => (
              <li
                key={t.label}
                className="flex items-center gap-1.5 rounded-full border border-flame-500/30 bg-flame-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-flame-400"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3 shrink-0"
                  aria-hidden
                >
                  <path d={t.path} />
                </svg>
                {t.label}
              </li>
            ))}
          </ul>
        </div>

        {/* ── Enlaces ──────────────────────────────────────────────────── */}
        <nav className="text-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-flame-400">
            Plataforma
          </p>
          <ul className="space-y-2 text-muted">
            <li><Link href="/#elige-juego" className="hover:text-ink">Elegir juego</Link></li>
            <li><Link href="/billetera" className="hover:text-ink">Billetera</Link></li>
            <li><Link href="/pedidos" className="hover:text-ink">Mis pedidos</Link></li>
            <li><Link href="/cuenta" className="hover:text-ink">Mi cuenta</Link></li>
            <li><Link href="/#como-funciona" className="hover:text-ink">Cómo funciona</Link></li>
            {config.supportEmail && (
              <li>
                <a href={`mailto:${config.supportEmail}`} className="hover:text-ink">
                  {config.supportEmail}
                </a>
              </li>
            )}
            {config.supportWhatsapp && (
              <li>
                <a
                  href={`https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink"
                >
                  Soporte: {config.supportWhatsapp}
                </a>
              </li>
            )}
          </ul>
        </nav>

        {/* ── Redes ────────────────────────────────────────────────────── */}
        {hasSocials && (
          <div>
            <p className="mb-4 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.15em] text-flame-400">
              Síguenos para más premios
              <span className="h-px flex-1 bg-flame-500/25" />
            </p>

            {config.socialWhatsappChannel && (
              <a
                href={config.socialWhatsappChannel}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-3 transition-colors hover:border-[#25D366]/80 hover:bg-[#25D366]/15"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#25D366] text-void">
                  <WhatsAppIcon className="size-6" />
                </span>
                <span className="flex-1 font-bold">Canal de WhatsApp</span>
                <span
                  className="text-[#25D366] transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                >
                  ›
                </span>
              </a>
            )}

            {smallSocials.length > 0 && (
              <ul className="mt-3 flex gap-3">
                {smallSocials.map(({ href, label, Icon, hover }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      title={label}
                      className={`grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted transition-colors ${hover}`}
                    >
                      <Icon className="size-5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line-soft px-4 py-5 text-center text-xs text-faint sm:px-6">
        © {year} <span className="font-semibold text-flame-400">{name}</span> · Todos los derechos
        reservados. Plataforma independiente, sin relación con Garena ni con sus marcas. ·{" "}
        <Link href="/terminos" className="underline hover:text-ink">
          Términos y condiciones
        </Link>
      </div>
    </footer>
  );
}
