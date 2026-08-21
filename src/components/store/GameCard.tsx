"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * Tarjeta para elegir el juego.
 *
 * Tres animaciones, cada una con su motivo:
 *  · Borde de líneas girando (CSS, ver `line-border` en globals.css): llama la
 *    atención sobre lo único accionable de la sección.
 *  · Zoom leve al pasar el mouse: confirma que es pulsable antes del clic.
 *  · Zoom fuerte al pulsar: la tarjeta "se acerca" y de ahí se entra a la
 *    tienda, para que el salto no se sienta como un corte.
 *
 * Es un <a> de verdad, no un <div> con onClick: funciona con el teclado, se
 * puede abrir en otra pestaña con Ctrl/Cmd o el botón central, y un buscador
 * lo ve como enlace. La animación solo se interpone en el clic normal.
 */

/** Debe coincidir con la duración de `card-dive` en globals.css. */
const ZOOM_MS = 520;

export interface GameCardProps {
  href: string;
  name: string;
  tagline: string;
  image: string;
  /** Se muestra como cinta en la esquina, p. ej. "Disponible". */
  badge?: string;
}

export function GameCard({ href, name, tagline, image, badge }: GameCardProps) {
  const router = useRouter();
  const [diving, setDiving] = useState(false);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Clic con modificador, botón central o "abrir en pestaña nueva":
      // se respeta el comportamiento normal del navegador.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      e.preventDefault();

      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        router.push(href);
        return;
      }

      setDiving(true);
      // Se precarga la ruta mientras dura el zoom: al terminar la animación la
      // tienda ya está lista y no se ve una pantalla en blanco intermedia.
      router.prefetch(href);
      window.setTimeout(() => router.push(href), ZOOM_MS);
    },
    [href, router],
  );

  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={`Ver recargas de ${name}`}
      className={[
        "line-border group block w-full max-w-[420px] transition-transform duration-300 ease-out",
        "hover:scale-[1.035] focus-visible:scale-[1.035] active:scale-[0.99]",
        diving ? "card-dive pointer-events-none" : "",
      ].join(" ")}
    >
      <span className="relative block overflow-hidden rounded-[18px] bg-abyss">
        <span className="relative block aspect-[5/4] w-full">
          <Image
            src={image}
            alt={name}
            fill
            sizes="(max-width: 640px) 90vw, 380px"
            priority
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
          {/* Velo suave hacia la franja de abajo, para que la imagen no se
              corte de golpe contra el texto. */}
          <span className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-abyss to-transparent" />

          {badge && (
            <span className="absolute right-3 top-3 rounded-full border border-ok/40 bg-ok/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ok backdrop-blur-sm">
              {badge}
            </span>
          )}
        </span>

        {/*
          El nombre va en una franja DEBAJO de la imagen, no encima: el arte de
          Free Fire ya lleva su propio logotipo abajo y superponer texto ahí
          ensuciaba las dos cosas. Así también se lee bien si algún día se
          cambia la imagen por otra.
        */}
        <span className="flex items-center justify-between gap-3 border-t border-line-soft bg-abyss px-4 py-3.5">
          <span className="block">
            <span className="block text-lg font-black leading-tight tracking-tight">{name}</span>
            <span className="mt-0.5 block text-xs text-muted">{tagline}</span>
          </span>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full border border-flame-500/50 bg-flame-500/15 text-flame-400 transition-all duration-300 group-hover:border-flame-500 group-hover:bg-flame-500 group-hover:text-void"
            aria-hidden
          >
            →
          </span>
        </span>
      </span>
    </a>
  );
}
