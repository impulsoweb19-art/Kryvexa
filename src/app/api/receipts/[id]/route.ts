import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDepositForViewer } from "@/server/services/deposits";
import { readReceiptStream } from "@/server/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga autorizada de comprobantes.
 *
 * Los comprobantes NO viven en /public. Solo pueden verlos su dueño o un
 * administrador, y siempre pasando por esta comprobación. La cabecera
 * `Content-Disposition: inline` con `X-Content-Type-Options: nosniff` evita
 * que un archivo malicioso se ejecute como HTML en el dominio.
 */
export const GET = route("receipts.get", async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const viewer = await requireUser();
  const { id } = await ctx.params;

  const deposit = await getDepositForViewer(id, viewer);
  const { stream, size } = await readReceiptStream(deposit.receiptPath);

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": deposit.receiptMime,
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="comprobante-${deposit.code}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
