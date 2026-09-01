import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import { computeSellPriceCents } from "@/lib/money";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getProvider, SYNCABLE_PROVIDERS } from "@/server/providers/registry";
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

/**
 * Un juego por proveedor (Free Fire en RecargasAmérica, Mobile Legends en
 * EpinBy). Cada proveedor puede traer catálogos de varios juegos; esto
 * decide cuál de ellos entra a la tienda.
 */
const GAME_FILTERS: Record<string, RegExp> = {
  recargas_america: /free\s*fire/i,
  epinby: /mobile\s*legends/i,
};

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
 * URL de la imagen de un producto: la que subió el admin, o a falta de esa,
 * la portada genérica del juego. Solo Free Fire en la v1, así que un único
 * fallback basta; con más juegos habría que mapear por `gameName`.
 *
 * Con STORAGE_DRIVER=blob, `imagePath` ya es la URL pública de Vercel Blob:
 * se usa tal cual, directo al CDN de Blob. Antes se hacía pasar SIEMPRE por
 * /api/products/[id]/image (pensado para el driver "local", donde el
 * archivo no es servible como estático), pero eso obligaba a una función
 * de Next a re-descargar y reenviar cada imagen del blob — con varias
 * imágenes cargando a la vez en la tienda, esa función fallaba de forma
 * intermitente. Ir directo al CDN es más rápido y no depende de esa función.
 */
/** Portada genérica por juego, para cuando el admin no subió imagen propia. */
const GAME_FALLBACK_IMAGES: Array<[RegExp, string]> = [
  [/free\s*fire/i, "/juegos/free-fire.jpg"],
  [/mobile\s*legends/i, "/juegos/mobile-legends.jpg"],
];

function fallbackImageForGame(gameName: string): string {
  const match = GAME_FALLBACK_IMAGES.find(([re]) => re.test(gameName));
  return match ? match[1] : "/juegos/free-fire.jpg";
}

export function productImageUrl(product: Pick<Product, "id" | "imagePath" | "gameName">): string {
  if (!product.imagePath) return fallbackImageForGame(product.gameName);
  if (/^https?:\/\//i.test(product.imagePath)) return product.imagePath;
  return `/api/products/${product.id}/image`;
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

/**
 * @param gameFilter Si se pasa, solo devuelve productos cuyo `gameName` haga
 * match (p. ej. la página de un juego concreto). Sin filtro, devuelve todo lo
 * visible — lo usa la portada para el contador general de paquetes.
 */
export async function listStoreProducts(gameFilter?: RegExp): Promise<StoreProduct[]> {
  const config = await getConfig();
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.visible, true), eq(products.active, true)))
    .orderBy(asc(products.sortOrder), asc(products.costUsdCents));

  const filtered = gameFilter ? rows.filter((p) => gameFilter.test(p.gameName)) : rows;
  return filtered.map((p) => toStoreProduct(p, config));
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
 * Sincroniza el catálogo de UN proveedor con la tabla local.
 *
 * Conserva SIEMPRE las decisiones del administrador (visible, featured,
 * sortOrder, precio fijo, margen propio): del proveedor solo se refrescan el
 * nombre, el costo y los input_fields.
 */
async function syncCatalogForProvider(providerCode: string): Promise<SyncResult> {
  const provider = getProvider(providerCode);
  if (!provider.isConfigured()) {
    throw new AppError("PROVIDER_NOT_CONFIGURED", {
      internalMessage: `El proveedor ${providerCode} no tiene API key configurada`,
    });
  }

  const fetched = await provider.listProducts();
  const result: SyncResult = { fetched: fetched.length, created: 0, updated: 0, deactivated: 0, skipped: 0 };

  // Sin filtro registrado, no se importa nada de ese proveedor (mejor omitir
  // que importar un juego que nadie pidió).
  const gameFilter = GAME_FILTERS[providerCode] ?? /(?!)/;
  const relevant = fetched.filter((p) => gameFilter.test(`${p.gameName} ${p.packageName}`));
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

/**
 * Sincroniza el catálogo. Sin argumento, recorre TODOS los proveedores con
 * catálogo propio (`SYNCABLE_PROVIDERS`) y suma los resultados — así el botón
 * «Sincronizar ahora» y el cron siguen llamando esto igual que antes, pero
 * ahora cubre RecargasAmérica y EpinBy en una sola pasada.
 *
 * Si un proveedor falla (p. ej. le falta la API key), no tumba a los demás:
 * el error queda registrado y el resumen refleja solo lo que sí se sincronizó.
 */
export async function syncCatalog(providerCode?: string): Promise<SyncResult> {
  if (providerCode) return syncCatalogForProvider(providerCode);

  const totals: SyncResult = { fetched: 0, created: 0, updated: 0, deactivated: 0, skipped: 0 };
  for (const code of SYNCABLE_PROVIDERS) {
    try {
      const partial = await syncCatalogForProvider(code);
      totals.fetched += partial.fetched;
      totals.created += partial.created;
      totals.updated += partial.updated;
      totals.deactivated += partial.deactivated;
      totals.skipped += partial.skipped;
    } catch (e) {
      logger.warn("No se pudo sincronizar un proveedor; se continúa con los demás", {
        providerCode: code,
        error: (e as Error).message,
      });
    }
  }
  return totals;
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
