import Image from "next/image";

/**
 * Fondo animado: una cascada lenta de logos cayendo.
 *
 * Decisiones deliberadas:
 *  · Es un componente de servidor sin JavaScript: solo HTML y CSS. No añade
 *    ni un byte al paquete que descarga el navegador.
 *  · Las posiciones están escritas a mano, no generadas con `Math.random()`:
 *    un valor aleatorio daría un HTML distinto en el servidor y en el cliente
 *    y React avisaría de un desajuste de hidratación.
 *  · Solo se animan `transform` y `opacity`, las dos propiedades que el
 *    navegador puede mover en la GPU sin recalcular el diseño de la página.
 *    Aunque haya 14 piezas cayendo, el coste es prácticamente nulo.
 *  · Los retardos son NEGATIVOS: cada logo arranca con la animación ya
 *    empezada, así al cargar la página la cascada está repartida por toda la
 *    pantalla en vez de aparecer todo de golpe desde arriba.
 *  · Opacidad muy baja y `blur` en las piezas grandes: tiene que dar textura
 *    al fondo, no competir con el texto. Con `prefers-reduced-motion` se
 *    oculta por completo (ver globals.css).
 *  · `aria-hidden` y `pointer-events-none`: es decoración; ni un lector de
 *    pantalla la anuncia ni intercepta un clic.
 */

type Drop = {
  /** Posición horizontal en %. */
  left: number;
  /** Lado del logo en px. */
  size: number;
  /** Duración de la caída en segundos: más grande = más lento. */
  duration: number;
  /** Desfase inicial (negativo) en segundos. */
  delay: number;
  /** Desplazamiento lateral durante la caída, en vw. */
  drift: number;
  /** Vueltas que da mientras cae, en grados. */
  spin: number;
  opacity: number;
  blur?: number;
  /** Las piezas marcadas se ocultan en pantallas pequeñas. */
  desktopOnly?: boolean;
};

const DROPS: Drop[] = [
  { left: 4, size: 44, duration: 26, delay: -3, drift: 3, spin: 120, opacity: 0.13 },
  { left: 13, size: 26, duration: 19, delay: -11, drift: -2, spin: -90, opacity: 0.1, desktopOnly: true },
  { left: 21, size: 68, duration: 34, delay: -20, drift: 4, spin: 80, opacity: 0.09, blur: 1.5 },
  { left: 29, size: 32, duration: 22, delay: -7, drift: -3, spin: 150, opacity: 0.11, desktopOnly: true },
  { left: 37, size: 52, duration: 29, delay: -25, drift: 2, spin: -110, opacity: 0.1, blur: 1 },
  { left: 45, size: 24, duration: 17, delay: -14, drift: 3, spin: 200, opacity: 0.11, desktopOnly: true },
  { left: 53, size: 60, duration: 32, delay: -5, drift: -4, spin: 90, opacity: 0.09, blur: 1.5 },
  { left: 61, size: 36, duration: 21, delay: -18, drift: 2, spin: -140, opacity: 0.12, desktopOnly: true },
  { left: 69, size: 28, duration: 24, delay: -9, drift: -2, spin: 100, opacity: 0.1 },
  { left: 76, size: 56, duration: 30, delay: -22, drift: 3, spin: -70, opacity: 0.1, blur: 1 },
  { left: 84, size: 30, duration: 18, delay: -2, drift: -3, spin: 170, opacity: 0.11, desktopOnly: true },
  { left: 91, size: 46, duration: 27, delay: -16, drift: 2, spin: 110, opacity: 0.13 },
  { left: 96, size: 22, duration: 20, delay: -12, drift: -2, spin: -180, opacity: 0.1, desktopOnly: true },
  { left: 66, size: 40, duration: 36, delay: -30, drift: 4, spin: 60, opacity: 0.08, blur: 1 },
];

export function LogoRain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {DROPS.map((d, i) => (
        <span
          key={i}
          className={`logo-drop absolute top-0 ${d.desktopOnly ? "hidden sm:block" : ""}`}
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
            ["--drop-drift" as string]: `${d.drift}vw`,
            ["--drop-spin" as string]: `${d.spin}deg`,
            ["--drop-opacity" as string]: d.opacity,
            filter: d.blur ? `blur(${d.blur}px)` : undefined,
          }}
        >
          <Image
            src="/marca/kryvexa-marca.png"
            alt=""
            width={167}
            height={192}
            sizes="80px"
            className="size-full object-contain"
          />
        </span>
      ))}
    </div>
  );
}
