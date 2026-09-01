import Link from "next/link";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { GameCard } from "@/components/store/GameCard";
import { formatPEN } from "@/lib/money";
import { listStoreProducts } from "@/server/services/catalog";
import { getConfig } from "@/server/services/settings";
import { getCurrentUser } from "@/lib/session";
import { getBalance } from "@/server/services/wallet";

/** Lee catálogo y configuración de la base: siempre en servidor, nunca cacheado. */
export const dynamic = "force-dynamic";

/**
 * Juegos que se ofrecen. Añadir otro es agregar un objeto aquí, su imagen en
 * `public/juegos/`, y la página de tienda propia de ese juego (ver
 * `/tienda/mobile-legends` como ejemplo). La rejilla se adapta sola y las
 * tarjetas quedan centradas automáticamente (`justify-center` más abajo).
 *
 * Cada juego tiene su PROPIA página de tienda (`href`): así, si el catálogo
 * de un juego nuevo se sincroniza mal o el proveedor falla, no afecta en nada
 * lo que ve quien entra a otro juego.
 */
const GAMES = [
  {
    name: "Free Fire",
    tagline: "Diamantes, pases y membresías",
    image: "/juegos/free-fire.jpg",
    badge: "Disponible",
    href: "/tienda",
  },
  {
    name: "Mobile Legends",
    tagline: "Diamantes",
    image: "/juegos/mobile-legends.jpg",
    badge: "Disponible",
    href: "/tienda/mobile-legends",
  },
];

export default async function HomePage() {
  const [products, config, user] = await Promise.all([
    listStoreProducts().catch(() => []),
    getConfig(),
    getCurrentUser(),
  ]);
  const balance = user ? await getBalance(user.id) : null;

  const cheapest = products.reduce<number | null>(
    (min, p) => (min === null || p.priceCents < min ? p.priceCents : min),
    null,
  );

  // Sin sesión no se puede entrar a la tienda: se manda a crear cuenta y, al
  // terminar, el propio flujo de registro deja al usuario dentro.
  const gameHref = (game: (typeof GAMES)[number]) => (user ? game.href : "/registro");

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:py-28">
          {/*
            El mensaje de la portada habla de la TIENDA en general, no de
            diamantes: aquí el visitante todavía no ha elegido juego. Lo
            específico de Free Fire (diamantes, ID de jugador) vive en
            /tienda, después de tocar la tarjeta del juego.
          */}
          <div className="rise rise-1">
            <Badge tone="info">
              <span className="size-1.5 rounded-full bg-plasma-400" />
              Recargas al instante
            </Badge>

            {/* El titular es el eslogan de la propia marca (el que va en el
                logo), no una frase genérica de tienda de recargas. */}
            <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Todo lo que necesitas,
              <br />
              <span className="text-gradient-flame">en un solo lugar.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Diamantes, pases y membresías para tus juegos favoritos. Cargas saldo una vez y
              recargas en segundos.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="#elige-juego" className="sm:w-auto">
                <Button size="lg" fullWidth>
                  Ver categorías
                </Button>
              </Link>
              <Link href={user ? "/billetera" : "/login"} className="sm:w-auto">
                <Button size="lg" variant="secondary" fullWidth>
                  {user ? "Ver mi billetera" : "Ya tengo cuenta"}
                </Button>
              </Link>
            </div>

            {/*
              Cifras reales, leídas del catálogo. A propósito no se inventa un
              contador de "ventas realizadas": un número inflado es publicidad
              engañosa, y uno real requeriría decidir si se cuentan las de este
              proyecto (que hoy son cero).
            */}
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line-soft pt-6">
              <div>
                <dt className="text-xs text-faint">Desde</dt>
                <dd className="text-lg font-bold tabular-nums">
                  {cheapest !== null ? formatPEN(cheapest) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Juegos</dt>
                <dd className="text-lg font-bold tabular-nums">{GAMES.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Entrega</dt>
                <dd className="text-lg font-bold">Inmediata</dd>
              </div>
            </dl>
          </div>

          {/* Saldo (con sesión) o invitación a registrarse (sin sesión). */}
          <div className="rise rise-2 relative hidden lg:block">
            <div className="panel relative overflow-hidden p-8">
              <div className="absolute -right-16 -top-16 size-48 rounded-full bg-flame-500/20 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-plasma-500/15 blur-3xl" />

              {balance ? (
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">
                    Tu saldo disponible
                  </p>
                  <p className="mt-2 text-5xl font-black tabular-nums text-ok">
                    {formatPEN(balance.balanceCents)}
                  </p>
                  {balance.pendingCents > 0 && (
                    <p className="mt-2 text-sm text-warn">
                      {formatPEN(balance.pendingCents)} en revisión
                    </p>
                  )}
                  <p className="mt-4 text-sm leading-relaxed text-muted">
                    Hola, {user?.name.split(" ")[0]}. Con saldo cargado, comprar te toma dos toques.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/billetera/recargar">
                      <Button size="sm">Agregar saldo</Button>
                    </Link>
                    <Link href="/pedidos">
                      <Button size="sm" variant="secondary">
                        Mis pedidos
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">
                    Cómo empieza
                  </p>
                  <p className="mt-3 text-2xl font-bold leading-snug">
                    Crea tu cuenta, carga saldo por Yape y compra cuando quieras.
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    El saldo queda en tu billetera. No vuelves a pasar por el pago en cada recarga.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/registro">
                      <Button size="sm">Crear cuenta</Button>
                    </Link>
                    <Link href="/login">
                      <Button size="sm" variant="secondary">
                        Iniciar sesión
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── ELIGE TU JUEGO ───────────────────────────────────────────────── */}
      <section id="elige-juego" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <SectionTitle
          eyebrow="Elige tu juego"
          title="¿Qué vas a recargar?"
          subtitle="Toca el juego para ver todos sus paquetes y precios."
          align="center"
        />

        {/* Saldo también en móvil, donde la tarjeta del hero no se muestra. */}
        {balance && (
          <div className="mt-6 flex justify-center lg:hidden">
            <Link
              href="/billetera/recargar"
              className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2.5 text-sm"
            >
              <span className="text-faint">Tu saldo</span>
              <span className="font-bold tabular-nums text-ok">
                {formatPEN(balance.balanceCents)}
              </span>
              <span className="text-flame-400">+</span>
            </Link>
          </div>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-6">
          {GAMES.map((game) => (
            <GameCard
              key={game.name}
              href={gameHref(game)}
              name={game.name}
              tagline={game.tagline}
              image={game.image}
              badge={game.badge}
            />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-faint">
          {cheapest !== null ? (
            <>
              Desde <span className="font-bold text-flame-400">{formatPEN(cheapest)}</span> ·{" "}
              {products.length} paquete(s) disponibles
            </>
          ) : (
            "El catálogo se sincroniza automáticamente con nuestro proveedor."
          )}
        </p>
      </section>

      {/* ── CÓMO FUNCIONA ────────────────────────────────────────────────── */}
      <section id="como-funciona" className="border-y border-line-soft bg-abyss/40 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle
            eyebrow="Paso a paso"
            title="¿Cómo funciona?"
            subtitle="Cuatro pasos. El pago por Yape solo lo haces cuando quieres cargar saldo, no en cada compra."
            align="center"
          />

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: "Regístrate", d: "Crea tu cuenta con tu correo. Toma menos de un minuto." },
              { n: "02", t: "Agrega saldo", d: "Yapea el monto, sube tu comprobante y lo acreditamos." },
              { n: "03", t: "Compra tu recarga", d: "Elige el paquete, ingresa tu ID de jugador y confirma." },
              { n: "04", t: "Recibe tus diamantes", d: "La recarga se ejecuta automáticamente en tu cuenta." },
            ].map((step) => (
              <li key={step.n} className="panel p-6">
                <span className="text-sm font-black tabular-nums text-flame-500">{step.n}</span>
                <h3 className="mt-3 text-base font-bold">{step.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── VENTAJAS ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionTitle eyebrow="Por qué aquí" title="Pensado para que no pierdas tiempo" />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Recargas rápidas", d: "Con saldo cargado, comprar toma dos toques. Sin volver a yapear." },
            { t: "Proceso seguro", d: "Tu saldo se descuenta solo cuando la recarga se confirma. Si falla, se devuelve." },
            { t: "Soporte real", d: "Escríbenos por WhatsApp si algo no salió como esperabas." },
            { t: "Historial completo", d: "Cada movimiento y cada pedido queda registrado en tu cuenta." },
          ].map((f) => (
            <Card key={f.t}>
              <div className="mb-3 grid size-10 place-items-center rounded-xl border border-line bg-abyss text-flame-400">
                ◆
              </div>
              <h3 className="text-base font-bold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── SOPORTE ──────────────────────────────────────────────────────── */}
      <section id="soporte" className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <Card className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold">¿Necesitas ayuda?</h2>
            <p className="mt-2 max-w-lg text-sm text-muted">
              Si tu depósito no aparece o una recarga quedó en proceso, escríbenos con tu código de
              pedido y lo revisamos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {config.supportWhatsapp && (
              <a
                href={`https://wa.me/${config.supportWhatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button>WhatsApp</Button>
              </a>
            )}
            {config.supportEmail && (
              <a href={`mailto:${config.supportEmail}`}>
                <Button variant="secondary">Enviar correo</Button>
              </a>
            )}
            {!config.supportWhatsapp && !config.supportEmail && (
              <p className="text-sm text-faint">Configura los datos de contacto desde el panel.</p>
            )}
          </div>
        </Card>
      </section>
    </>
  );
}
