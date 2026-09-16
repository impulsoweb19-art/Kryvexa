/**
 * Compresión de imágenes EN EL NAVEGADOR, antes de subirlas.
 *
 * No es una optimización estética: es lo que hace que la subida funcione.
 * En Vercel, una función serverless acepta como máximo 4.5 MB de cuerpo de
 * petición y se corta a los pocos segundos de ejecución. Una foto tomada con
 * la cámara de un celular pesa entre 3 y 8 MB, así que la petición moría en
 * la plataforma —antes de llegar a nuestro código, o sea sin poder responder
 * un error decente— y el navegador solo decía "Failed to fetch".
 *
 * Redimensionando a 1600 px y recomprimiendo, esa misma foto queda en unos
 * pocos cientos de KB: entra de sobra en el límite y sube rápido incluso con
 * datos móviles. Un comprobante de Yape se lee perfectamente a ese tamaño.
 *
 * Si algo falla (formato raro, navegador sin canvas), se devuelve el archivo
 * original: comprimir es una mejora, nunca un requisito para poder enviar.
 */

/**
 * 1280 px y calidad 0.75 dejan un comprobante de Yape en torno a 100-200 KB,
 * perfectamente legible. Se bajó desde 1600/0.82 porque el problema real no
 * era el límite del servidor sino la subida en sí: con datos móviles, cuanto
 * más pequeño es el envío, más probable es que llegue entero.
 */
const MAX_DIMENSION = 1280;
const QUALITY = 0.75;

/** Por debajo de esto, lo comprimido no puede ser un comprobante de verdad. */
const MIN_BYTES_RAZONABLE = 8 * 1024;

interface Decodificada {
  source: CanvasImageSource & { width: number; height: number };
  /** Hay que llamarlo DESPUÉS de dibujar, nunca antes. */
  liberar: () => void;
}

/** Decodifica el archivo a algo que se pueda dibujar en un canvas. */
async function decode(file: File): Promise<Decodificada> {
  // createImageBitmap es lo más rápido y no toca el DOM, pero no siempre se
  // puede usar: falta en navegadores viejos (iOS < 15) y ADEMÁS puede fallar
  // aunque exista (memoria, un JPEG que no le gusta…). Antes solo se
  // contemplaba lo primero, así que cuando fallaba se abandonaba la compresión
  // y se subía la foto entera: justo lo que se vio el 16/9/2026, un
  // comprobante de 802 KB saliendo sin comprimir desde un Android.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, liberar: () => bitmap.close() };
    } catch {
      // Sigue al método con <img>, que es más lento pero más tolerante.
    }
  }

  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo leer la imagen"));
    el.src = url;
  });

  // `onload` avisa de que terminó de DESCARGARSE, no de que esté lista para
  // dibujar. Sin esperar a que decodifique —y liberando la URL antes de
  // tiempo, como se hacía— algunos Android dibujaban un lienzo vacío: el
  // comprobante llegaba completamente en blanco (visto el 16/9/2026).
  if (typeof img.decode === "function") {
    await img.decode().catch(() => undefined);
  }

  return {
    // naturalWidth es el tamaño real del archivo; `width` puede venir de la
    // maquetación si el elemento llega a insertarse en la página.
    source: Object.assign(img, {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    }),
    liberar: () => URL.revokeObjectURL(url),
  };
}

export async function compressImage(file: File): Promise<File> {
  // Los PDF no se pueden redimensionar: se envían tal cual y el límite de
  // tamaño los filtra antes de intentar la subida.
  if (!file.type.startsWith("image/")) return file;

  try {
    const { source, liberar } = await decode(file);
    if (!source.width || !source.height) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Fondo blanco: si el original era un PNG con transparencia, al pasar a
    // JPEG esas zonas saldrían negras y taparían parte del comprobante.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );

    liberar(); // recién ahora: antes de dibujar dejaba el lienzo en blanco

    // Una captura ya pequeña puede salir MÁS pesada al recomprimirla; en ese
    // caso el original es la mejor versión.
    if (!blob || blob.size >= file.size) return file;

    /**
     * Red de seguridad: un comprobante real, aunque sea sencillo, nunca baja
     * de unos pocos KB. Un resultado ridículamente pequeño significa que el
     * lienzo salió vacío, y subir eso es peor que subir la foto original: el
     * administrador recibe una imagen en blanco y no puede verificar el pago.
     */
    if (blob.size < MIN_BYTES_RAZONABLE) return file;

    return new File([blob], "comprobante.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
