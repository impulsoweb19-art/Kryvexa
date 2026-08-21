import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * Conexión a PostgreSQL.
 *
 * La inicialización es PEREZOSA a propósito: `next build` importa estos módulos
 * para analizar las rutas, y no queremos que el build exija una DATABASE_URL ni
 * abra sockets. El pool se crea la primera vez que alguien ejecuta una consulta.
 *
 * En desarrollo se guarda en globalThis para que el hot-reload no acumule pools.
 */
const globalForDb = globalThis as unknown as {
  __pool?: Pool;
  __db?: NodePgDatabase<typeof schema>;
};

function init(): NodePgDatabase<typeof schema> {
  if (globalForDb.__db) return globalForDb.__db;

  const pool =
    globalForDb.__pool ??
    new Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

  const instance = drizzle(pool, { schema });

  if (env().NODE_ENV !== "production") {
    globalForDb.__pool = pool;
    globalForDb.__db = instance;
  }
  return instance;
}

/**
 * Proxy: se comporta exactamente como la instancia de Drizzle, pero no la
 * construye hasta el primer acceso a una propiedad.
 */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = init();
    const value = Reflect.get(instance as object, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Database = NodePgDatabase<typeof schema>;
/** Tipo de la transacción, para servicios que aceptan `tx` o `db` indistintamente. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export * as tables from "./schema";
