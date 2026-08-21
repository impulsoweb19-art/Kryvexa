import Image from "next/image";
import { cx } from "@/components/ui";

/**
 * Marca de la tienda.
 *
 * El logo real vive en `public/marca/` como PNG con fondo transparente, así
 * que se ve bien sobre cualquier fondo del tema (cabecera casi negra, panel
 * gris oscuro, pie). Para cambiarlo basta reemplazar esos dos archivos por
 * otros con el mismo nombre; no hay que tocar código:
 *
 *   public/marca/kryvexa-marca.png → solo el símbolo (hexágono)
 *   public/marca/kryvexa-logo.png  → símbolo + nombre
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/marca/kryvexa-marca.png"
      alt=""
      width={167}
      height={192}
      priority
      className={cx("size-9 w-auto object-contain", className)}
      aria-hidden
    />
  );
}

/**
 * Símbolo + nombre.
 *
 * El nombre se escribe en HTML (no viene dentro de la imagen) para que se
 * pueda seleccionar, lo lea un buscador y siga funcionando si el
 * administrador cambia el nombre de la tienda desde el panel. Las tres
 * últimas letras van en el azul del logo, como en la marca original
 * («KRYV» blanco + «EXA» azul).
 */
export function Logo({ name = "KRYVEXA", className }: { name?: string; className?: string }) {
  const head = name.length > 3 ? name.slice(0, -3) : name;
  const tail = name.length > 3 ? name.slice(-3) : "";

  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        {head}
        <span className="text-plasma-400">{tail}</span>
      </span>
    </span>
  );
}

/** Logo completo como imagen, para el pie y pantallas de bienvenida. */
export function LogoFull({ className }: { className?: string }) {
  return (
    <Image
      src="/marca/kryvexa-logo.png"
      alt="KRYVEXA"
      width={418}
      height={256}
      className={cx("h-16 w-auto object-contain", className)}
    />
  );
}
