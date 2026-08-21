import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/server/services/settings";
import { mimeFromStoredPath, readReceiptStream } from "@/server/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * QR de Yape subido por el administrador.
 *
 * Se sirve desde aquí y no desde /public porque el archivo vive en el
 * almacenamiento (disco del servidor o Vercel Blob), fuera de lo que Next
 * publica como estático. Exige sesión: no hace falta que un desconocido pueda
 * descargar el QR de cobro del negocio. El QR que viene incluido en el
 * proyecto (`/yape-qr.png`) no pasa por aquí — ese sí es un archivo estático.
 */
export const GET = route("yape-qr.get", async () => {
  await requireUser();
  const config = await getConfig();

  if (!config.yapeQrPath) {
    throw new AppError("NOT_FOUND", { userMessage: "No hay un QR configurado." });
  }

  const { stream, size } = await readReceiptStream(config.yapeQrPath);
  const headers: Record<string, string> = {
    "Content-Type": mimeFromStoredPath(config.yapeQrPath),
    "Content-Disposition": "inline; filename=\"yape-qr\"",
    // Privado y de vida corta: si el administrador cambia el QR, el usuario
    // debe ver el nuevo en cuestión de minutos, no al día siguiente.
    "Cache-Control": "private, max-age=60",
    "X-Content-Type-Options": "nosniff",
  };
  if (size > 0) headers["Content-Length"] = String(size);

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, { headers });
});
