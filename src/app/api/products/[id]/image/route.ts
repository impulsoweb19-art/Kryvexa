import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { getProductById } from "@/server/services/catalog";
import { mimeFromStoredPath, readReceiptStream } from "@/server/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Imagen de un paquete subida por el administrador.
 *
 * Se sirve desde aquí y no desde /public por la misma razón que el QR de
 * Yape: el archivo vive en el almacenamiento (disco o Vercel Blob), fuera de
 * lo que Next publica como estático. Exige sesión porque la tienda entera la
 * exige (`requireUserPage`); no hay necesidad de que sea descargable por un
 * desconocido sin cuenta.
 */
export const GET = route("products.image.get", async (_req, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;

  const product = await getProductById(id);
  if (!product?.imagePath) {
    throw new AppError("NOT_FOUND", { userMessage: "Este paquete no tiene imagen." });
  }

  const { stream, size } = await readReceiptStream(product.imagePath);
  const headers: Record<string, string> = {
    "Content-Type": mimeFromStoredPath(product.imagePath),
    "Content-Disposition": "inline",
    // Cambia poco, pero cuando el admin la reemplaza debe verse pronto.
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };
  if (size > 0) headers["Content-Length"] = String(size);

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, { headers });
});
