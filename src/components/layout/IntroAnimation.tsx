"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";

/**
 * Animación de entrada (punto 10 del brief).
 *
 * Decisiones deliberadas:
 *  · NO es una pantalla de carga. El contenido ya está renderizado debajo; esto
 *    es solo un velo que se desvanece. La página es utilizable de inmediato.
 *  · Dura ~1.1 s en total y se desmonta del árbol al terminar: cero coste
 *    después.
 *  · `pointer-events-none` desde el primer frame: aunque el velo siga visible,
 *    no bloquea un clic.
 *  · Si el usuario tiene `prefers-reduced-motion`, no se monta nunca. No se
 *    reduce la animación: se omite por completo.
 *  · Solo se muestra en la primera carga de la pestaña (sessionStorage), no en
 *    cada navegación interna.
 */
const TOTAL_MS = 1_120;
const SEEN_KEY = "intro-seen";

export function IntroAnimation() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Modo privado o cookies bloqueadas: se muestra la animación, sin más.
    }

    if (reduced || alreadySeen) return;

    setVisible(true);
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sin persistencia, aceptable */
    }

    const timer = window.setTimeout(() => setVisible(false), TOTAL_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="intro-overlay pointer-events-none fixed inset-0 z-100 grid place-items-center bg-void"
    >
      <div className="relative">
        <div className="intro-mark relative grid size-24 place-items-center overflow-hidden rounded-3xl border border-line bg-abyss">
          <LogoMark className="size-12" />
          {/* Barrido de luz: un solo elemento, transform puro, sin repintados. */}
          <span className="intro-sweep absolute inset-y-0 -left-1/2 w-1/2 bg-linear-to-r from-transparent via-white/12 to-transparent" />
        </div>
      </div>
    </div>
  );
}
