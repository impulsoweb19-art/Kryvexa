import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Almacenamiento de comprobantes de pago.
 *
 * Los comprobantes de Yape contienen nombre, teléfono y montos: son datos
 * personales. Por eso:
 *   · se guardan FUERA de /public (Next nunca los sirve como estáticos)
 *   · el nombre del archivo es aleatorio (no se puede adivinar ni enumerar)
 *   · se sirven por una ruta autenticada que comprueba dueño o rol admin
 *   · el tipo se verifica por los BYTES REALES del archivo, no por la
 *     extensión ni por el Content-Type que envía el navegador (ambos se
 *     falsifican en dos segundos)
 *
 * DOS "DRIVERS" (elegidos con STORAGE_DRIVER):
 *   · "local" — disco del servidor. Sirve para `npm run demo` y para
 *     Docker/VPS, donde RECEIPTS_DIR es un volumen que persiste de verdad.
 *   · "blob"  — Vercel Blob. En Vercel el disco NO persiste entre
 *     invocaciones ni entre despliegues, así que ahí es obligatorio.
 * En ambos casos lo único que cambia es DÓNDE vive el archivo: la ruta que
 * se guarda en la base de datos (`receiptPath`) sigue siendo un identificador
 * opaco que nunca se expone al navegador directamente — siempre se sirve a
 * través de /api/receipts/[id], que comprueba dueño o admin primero. Para
 * "blob" esa ruta guardada es la URL que devuelve Vercel Blob (impredecible,
 * pero igual nunca se le entrega al cliente en crudo).
 */

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

export type AllowedMime = keyof typeof ALLOWED;

/** Firmas de archivo (magic bytes). La única comprobación en la que confiamos. */
function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function receiptsRoot(): string {
  const dir = env().RECEIPTS_DIR;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export interface StoredReceipt {
  /** Ruta RELATIVA a RECEIPTS_DIR. Es lo único que guardamos en la base. */
  relativePath: string;
  mime: AllowedMime;
  size: number;
}

export async function storeReceipt(file: File): Promise<StoredReceipt> {
  const maxBytes = env().MAX_RECEIPT_BYTES;

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    throw new AppError("UPLOAD_INVALID", { userMessage: "Debes adjuntar el comprobante de pago." });
  }
  if (file.size > maxBytes) {
    throw new AppError("UPLOAD_INVALID", {
      userMessage: `El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buffer);
  if (!mime) {
    throw new AppError("UPLOAD_INVALID", {
      userMessage: "Formato no permitido. Sube una imagen JPG, PNG, WebP o un PDF.",
      internalMessage: `magic bytes no reconocidos (declarado: ${file.type})`,
    });
  }

  const now = new Date();
  const folder = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const relativePath = path.join(folder, `${randomUUID()}.${ALLOWED[mime]}`);

  return { relativePath: await write(relativePath, buffer, mime), mime, size: buffer.length };
}

/**
 * Escribe el archivo con el driver activo y devuelve el identificador que hay
 * que guardar en la base: la ruta relativa (driver "local") o la URL que
 * devuelve Vercel Blob (driver "blob").
 */
async function write(relativePath: string, buffer: Buffer, mime: AllowedMime): Promise<string> {
  if (env().STORAGE_DRIVER === "blob") {
    // La comprobación va aquí y no en la validación global del entorno: así,
    // si el almacén está mal configurado, falla SOLO esto y no toda la web.
    if (!env().BLOB_READ_WRITE_TOKEN) {
      throw new AppError("INTERNAL", {
        userMessage:
          "Ahora mismo no podemos recibir comprobantes. Avísanos por soporte y lo resolvemos en minutos.",
        internalMessage:
          "STORAGE_DRIVER=blob pero falta BLOB_READ_WRITE_TOKEN. En Vercel: Storage → Create Database → Blob (lo añade solo). Alternativa temporal: STORAGE_DRIVER=local.",
      });
    }

    // Vercel Blob no tiene "privado por sesión": la URL que devuelve es
    // impredecible (nombre aleatorio + sufijo aleatorio), y aun así nunca la
    // ve el navegador — solo la usa el servidor en readReceiptStream().
    const blob = await put(relativePath.split(path.sep).join("/"), buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
    });
    return blob.url;
  }

  const absolute = path.join(receiptsRoot(), relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, buffer, { mode: 0o600 });
  return relativePath;
}

/**
 * Guarda el QR de Yape que sube el administrador.
 *
 * Mismas comprobaciones que un comprobante (bytes reales, tamaño), pero aquí
 * NO se acepta PDF: esto se muestra como imagen en la pantalla de recarga, y
 * un PDF no se puede pintar en un <img>.
 */
export async function storeQr(file: File): Promise<StoredReceipt> {
  const maxBytes = env().MAX_RECEIPT_BYTES;

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    throw new AppError("UPLOAD_INVALID", { userMessage: "Elige la imagen del QR." });
  }
  if (file.size > maxBytes) {
    throw new AppError("UPLOAD_INVALID", {
      userMessage: `La imagen supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buffer);
  if (!mime || mime === "application/pdf") {
    throw new AppError("UPLOAD_INVALID", {
      userMessage: "El QR debe ser una imagen JPG, PNG o WebP (no un PDF).",
      internalMessage: `magic bytes: ${mime ?? "desconocidos"} (declarado: ${file.type})`,
    });
  }

  const relativePath = path.join("qr", `${randomUUID()}.${ALLOWED[mime]}`);
  return { relativePath: await write(relativePath, buffer, mime), mime, size: buffer.length };
}

/**
 * Deduce el Content-Type a partir de la extensión del archivo guardado.
 *
 * Solo se usa para archivos que ESTE módulo escribió: la extensión se asignó
 * a partir de los bytes reales en `storeReceipt`/`storeQr`, así que aquí no
 * estamos confiando en nada que venga del usuario. Si no se reconoce, se
 * devuelve un tipo genérico en vez de adivinar.
 */
export function mimeFromStoredPath(storedPath: string): string {
  const ext = storedPath.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  for (const [mime, allowedExt] of Object.entries(ALLOWED)) {
    if (allowedExt === ext) return mime;
  }
  return "application/octet-stream";
}

/**
 * Resuelve la ruta absoluta comprobando que no se escape del directorio raíz.
 * Defensa contra path traversal aunque la base de datos estuviera contaminada.
 */
export function resolveReceiptPath(relativePath: string): string {
  const root = receiptsRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root + path.sep)) {
    throw new AppError("FORBIDDEN", { internalMessage: `Ruta fuera del almacén: ${relativePath}` });
  }
  return absolute;
}

export async function readReceiptStream(storedPath: string) {
  // Los registros guardados con STORAGE_DRIVER=blob llevan la URL completa
  // que devolvió Vercel Blob; los guardados en modo "local" llevan una ruta
  // relativa. Distinguimos por la forma, no por la configuración actual, para
  // que comprobantes antiguos sigan sirviéndose si el driver cambia después.
  if (/^https?:\/\//i.test(storedPath)) {
    const res = await fetch(storedPath);
    if (!res.ok || !res.body) {
      throw new AppError("NOT_FOUND", { userMessage: "El comprobante ya no está disponible." });
    }
    const sizeHeader = res.headers.get("content-length");
    return {
      stream: Readable.fromWeb(res.body as never),
      size: sizeHeader ? Number(sizeHeader) : 0,
    };
  }

  const absolute = resolveReceiptPath(storedPath);
  try {
    const info = await stat(absolute);
    return { stream: createReadStream(absolute), size: info.size };
  } catch {
    throw new AppError("NOT_FOUND", { userMessage: "El comprobante ya no está disponible." });
  }
}
