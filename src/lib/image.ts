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

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

/** Decodifica el archivo a algo que se pueda dibujar en un canvas. */
async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  // createImageBitmap es lo más rápido y no toca el DOM, pero falta en
  // navegadores viejos (iOS < 15), así que ahí caemos a un <img> normal.
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressImage(file: File): Promise<File> {
  // Los PDF no se pueden redimensionar: se envían tal cual y el límite de
  // tamaño los filtra antes de intentar la subida.
  if (!file.type.startsWith("image/")) return file;

  try {
    const source = await decode(file);
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

    if ("close" in source && typeof source.close === "function") source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );

    // Una captura ya pequeña puede salir MÁS pesada al recomprimirla; en ese
    // caso el original es la mejor versión.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], "comprobante.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
