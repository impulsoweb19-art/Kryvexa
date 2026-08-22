import type { MetadataRoute } from "next";
import { baseUrlString } from "@/lib/base-url";

/**
 * sitemap.xml generado por Next.js (aparece en /sitemap.xml).
 *
 * Solo lista páginas PÚBLICAS: es lo que le decimos a Google que rastree e
 * indexe. El panel admin y las páginas de cuenta quedan fuera a propósito
 * (ver robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = baseUrlString();
  const now = new Date();

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/tienda`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/registro`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
