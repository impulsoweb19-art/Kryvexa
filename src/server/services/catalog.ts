import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import { computeSellPriceCents } from "@/lib/money";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getProvider, DEFAULT_PROVIDER } from "@/server/providers/registry";
import type { ProviderInputField } from "@/server/providers/types";
import { getConfig, type StoreConfig } from "./settings";

/**
 * Catálogo.
 *
 * El catálogo NO se pide al proveedor en cada visita: se cachea en la tabla
 * `products` y se refresca por cron. Así la tienda sigue funcionando aunque la
 * API esté lenta, y no se malgasta el rate limit del proveedor.
 *
 * El precio de venta SIEMPRE se calcula en el servidor a partir del costo del
 * proveedor, el tipo de cambio y el margen. El navegador nunca decide precios.
 */

/** Solo Free Fire en la v1 (punto 1 del brief). */
const V1_GAME_FILTER = /free\s*fire/i;

export interface StoreProduct {
  id: string;
  gameName: string;
  packageName: string;
  kind: Product["kind"];
  priceCents: number;
  inputFields: ProviderInputField[];
  validationSupported: boolean;
  featured: boolean;
  sortOrder: number;
  imageUrl: string;
}

/**
 * URL de la imagen de un producto: la que subió el admin (servida por
 * /api/products/[id]/image, con sesión) o, a falta de esa, la portada
 * genérica del juego. Solo Free Fire en la v1, así que un único fallback
 * basta; con más juegos habría que mapear por `gameName`.
 */
export function productImageUrl(product: Pick<Product, "id" | "imagePath">): string {
  return product.imagePath ? `/api/products/${product.id}/image` : "/juegos/free-fire.jpg";
}

/** Precio final en céntimos de PEN. Respeta el precio fijo del admin si existe. */
export function sellPriceCents(product: Product, config: StoreConfig): number {
  if (product.priceCents != null) return product.priceCents;
  const marginBps = product.marginBps ?? config.marginBps;
  return computeSellPriceCents(product.costUsdCents, config.exchangeRate, marginBps);
}

export function toStoreProduct(product: Product, config: StoreConfig): StoreProduct {
  return {
    id: product.id,
    gameName: product.gameName,
    packageName: product.packageName,
    kind: product.kind,
    priceCents: sellPriceCents(product, config),
    inputFields: (product.inputFields as ProviderInputField[]) ?? [],
    validationSupported: product.validationSupported,
    featured: product.featured,
    sortOrder: product.sortOrder,
    imageUrl: productImageUrl(product),
  };
}

export async function listStoreProducts(): Promise<StoreProduct[]> {
  const config = await getConfig();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.visible, true), eq(products.active, true)))
    .orderBy(asc(products.sortOrder), asc(products.costUsdCents));

  return rows.map((p) => toStoreProduct(p, config));
}

export async function listAllProducts(): Promise<Product[]> {
  return db.select().from(products).orderBy(asc(products.sortOrder), asc(products.costUsdCents));
}

export async function getProductById(id: string): Promise<Product | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row ?? null;
}

/** Igual que `getProductById` pero exige que sea comprable ahora mismo. */
export async function getPurchasableProduct(id: string): Promise<{ product: Product; config: StoreConfig }> {
  const config = await getConfig();
  const product = await getProductById(id);

  if (!product) throw new AppError("NOT_FOUND", { userMessage: "El producto no existe." });
  if (!product.active || !product.visible) throw new AppError("PRODUCT_UNAVAILABLE");
  if (!config.purchasesEnabled) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      userMessage: "Las compras están temporalmente pausadas. Vuelve a intentarlo en unos minutos.",
    });
  }
  return { product, config };
}

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
}

/**
 * Sincroniza el catálogo del proveedor con la tabla local.
 *
 * Conserva SIEMPRE las decisiones del administrador (visible, featured,
 * sortOrder, precio fijo, margen propio): del proveedor solo se refrescan el
 * nombre, el costo y los input_fields.
 */
export async function syncCatalog(providerCode = DEFAULT_PROVIDER): Promise<SyncResult> {
  const provider = getProvider(providerCode);
  if (!provider.isConfigured()) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      internalMessage: `El proveedor ${providerCode} no tiene API key configurada`,
    });
  }

  const fetched = await provider.listProducts();
  const result: SyncResult = { fetched: fetched.length, created: 0, updated: 0, deactivated: 0, skipped: 0 };

  const relevant = fetched.filter((p) => V1_GAME_FILTER.test(`${p.gameName} ${p.packageName}`));
  result.skipped = fetched.length - relevant.length;

  const existing = await db.select().from(products).where(eq(products.providerCode, providerCode));
  const byKey = new Map(existing.map((p) => [`${p.kind}:${p.externalId}`, p]));
  const seen = new Set<string>();

  for (const item of relevant) {
    const key = `${item.kind}:${item.externalId}`;
    seen.add(key);
    const current = byKey.get(key);

    if (!current) {
      await db.insert(products).values({
        providerCode,
        externalId: item.externalId,
        kind: item.kind,
        sku: item.sku ?? null,
        gameName: item.gameName,
        packageName: item.packageName,
        costUsdCents: item.costUsdCents,
        inputFields: item.inputFields as never,
        validationSupported: item.validationSupported,
        active: item.active,
        // Producto nuevo: visible por defecto, ordenado por costo.
        sortOrder: Math.min(9999, Math.round(item.costUsdCents / 100)),
        lastSyncedAt: new Date(),
      });
      result.created += 1;
    } else {
      await db
        .update(products)
        .set({
          sku: item.sku ?? null,
          gameName: item.gameName,
          packageName: item.packageName,
          costUsdCents: item.costUsdCents,
          inputFields: item.inputFields as never,
          validationSupported: item.validationSupported,
          active: item.active,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
          // NO se tocan: visible, featured, sortOrder, priceCents, marginBps.
        })
        .where(eq(products.id, current.id));
      result.updated += 1;
    }
  }

  // Lo que el proveedor dejó de ofrecer se desactiva, no se borra: las órdenes
  // antiguas conservan su referencia.
  const staleIds = existing.filter((p) => !seen.has(`${p.kind}:${p.externalId}`) && p.active).map((p) => p.id);
  if (staleIds.length) {
    await db
      .update(products)
      .set({ active: false, updatedAt: new Date() })
      .where(inArray(products.id, staleIds));
    result.deactivated = staleIds.length;
  }

  logger.info("Catálogo sincronizado", { providerCode, ...result });
  return result;
}

export async function updateProductOverride(
  productId: string,
  patch: Partial<Pick<Product, "visible" | "featured" | "sortOrder" | "priceCents" | "marginBps">>,
) {
  const [updated] = await db
    .update(products)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND");
  return updated;
}

/** Fija la imagen subida por el admin para un paquete. */
export async function setProductImage(productId: string, imagePath: string): Promise<Product> {
  const [updated] = await db
    .update(products)
    .set({ imagePath, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND");
  return updated;
}

/**
 * Quita la imagen del paquete (vuelve a la portada genérica del juego).
 *
 * El archivo subido no se borra del almacenamiento, igual que al restaurar
 * el QR de Yape: son pocos KB y así no se arriesga borrar algo por error.
 */
export async function clearProductImage(productId: string): Promise<Product> {
  const [updated] = await db
    .update(products)
    .set({ imagePath: null, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!updated) throw new AppError("NOT_FOUND");
  return updated;
}

export async function catalogStats() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      visible: sql<number>`count(*) FILTER (WHERE ${products.visible} AND ${products.active})`,
      lastSync: sql<Date | null>`max(${products.lastSyncedAt})`,
    })
    .from(products);
  return {
    total: Number(row?.total ?? 0),
    visible: Number(row?.visible ?? 0),
    lastSync: row?.lastSync ?? null,
  };
}
