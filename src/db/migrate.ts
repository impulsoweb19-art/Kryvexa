/**
 * Aplica las migraciones SQL de ./drizzle contra DATABASE_URL.
 *
 *   npm run db:generate   # genera el SQL a partir de src/db/schema.ts
 *   npm run db:migrate    # lo aplica
 *
 * Este script NO importa src/db/index.ts a propósito: aquel módulo lleva
 * `server-only` y solo puede ejecutarse dentro de Next.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  console.log("Aplicando migraciones…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migraciones aplicadas.");

  await pool.end();
}

main().catch((e) => {
  console.error("Fallo al migrar:", e);
  process.exit(1);
});
