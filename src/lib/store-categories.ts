/**
 * Agrupaciones de la tienda.
 *
 * Algunos productos se venden en familias largas —las Cajas y los Fragmentos
 * Evo son diez paquetes que solo se diferencian en la cantidad—, y listarlos
 * sueltos junto a los demás llena la pantalla y esconde el resto del catálogo.
 * Con esto, en la tienda aparece UNA casilla por familia y los paquetes se ven
 * al entrar en ella.
 *
 * La pertenencia se decide por `externalId`, no por el nombre: los nombres los
 * edita el administrador desde el panel y un día podrían dejar de decir
 * "Cajas Evo", mientras que el identificador es estable.
 *
 * Para agregar una familia nueva basta con añadir una entrada aquí; la tienda
 * y la página de categoría la recogen solas.
 */

export interface StoreCategory {
  /** Va en la URL: /tienda/categoria/{slug} */
  slug: string;
  title: string;
  description: string;
  matches: (product: { providerCode: string; externalId: string }) => boolean;
}

export const STORE_CATEGORIES: StoreCategory[] = [
  {
    slug: "cajas-evo",
    title: "Cajas Evo",
    description: "Elige cuántas cajas quieres.",
    matches: (p) => p.providerCode === "manual" && p.externalId.startsWith("manual-cajas-evo-"),
  },
  {
    slug: "fragmentos-evo",
    title: "Fragmentos Evo",
    description: "Elige cuántos fragmentos quieres.",
    matches: (p) => p.providerCode === "manual" && p.externalId.startsWith("manual-fragmentos-evo-"),
  },
];

export function findCategory(slug: string): StoreCategory | undefined {
  return STORE_CATEGORIES.find((c) => c.slug === slug);
}

export function categoryOf(product: { providerCode: string; externalId: string }): StoreCategory | undefined {
  return STORE_CATEGORIES.find((c) => c.matches(product));
}
