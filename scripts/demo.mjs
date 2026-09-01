/**
 * ARRANQUE DE DEMOSTRACIÓN SIN DOCKER
 *
 *     npm run demo
 *
 * Pensado para equipos donde Docker no puede arrancar (virtualización
 * desactivada en la BIOS, políticas de la empresa, Windows Home antiguo…).
 *
 * Levanta un PostgreSQL *portátil* dentro de la propia carpeta del proyecto
 * (`.postgres-demo/`). No instala nada en el sistema, no toca el registro de
 * Windows y no necesita permisos de administrador: son unos binarios que se
 * descargan la primera vez y se ejecutan desde aquí.
 *
 * Después prepara la base de datos, crea el administrador, carga el catálogo de
 * ejemplo y arranca la aplicación. Con Ctrl+C se apaga todo de forma ordenada.
 *
 * Esto es SOLO para verlo en tu máquina. Para producción se usa PostgreSQL de
 * verdad (ver README.md).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, ".postgres-demo");
const PORT = 54329;
const DB_USER = "recargas";
const DB_PASSWORD = "recargas";
const DB_NAME = "recargas";

const ENV = {
  ...process.env,
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}`,
  SESSION_SECRET: "solo-para-ver-en-local-no-usar-en-produccion-0123456789",
  CRON_SECRET: "solo-para-ver-en-local-1234",
  PROVIDER_MOCK: "true",
  RECARGAS_AMERICA_BASE_URL: "https://panel.recargasamerica.com/api/v1",
  RECARGAS_AMERICA_API_KEY: "",
  RECARGAS_AMERICA_TIMEOUT_MS: "30000",
  EPINBY_BASE_URL: "https://epinby.com/api/v1",
  EPINBY_API_KEY: "",
  EPINBY_TIMEOUT_MS: "30000",
  EPINBY_WEBHOOK_SECRET: "solo-para-ver-en-local-webhook-secret",
  RECEIPTS_DIR: path.join(ROOT, "storage", "receipts"),
  MAX_RECEIPT_BYTES: "5242880",
  SEED_ADMIN_EMAIL: "admin@demo.local",
  SEED_ADMIN_PASSWORD: "Demo12345",
  SEED_ADMIN_NAME: "Administrador",
  SEED_DEMO_CATALOG: "true",
};

const line = (s = "") => console.log(s);
const title = (s) => {
  line("");
  line("──────────────────────────────────────────────────────");
  line(`  ${s}`);
  line("──────────────────────────────────────────────────────");
};

/**
 * Rutas a los ejecutables locales.
 *
 * Se invocan con `node <ruta>` en vez de `npx …` a propósito: `npx` en Windows
 * mete un `cmd.exe` por medio, y al pulsar Ctrl+C el proceso real de Next
 * sobrevive al padre y se queda ocupando el puerto 3000. Sin esa capa
 * intermedia, matar al hijo funciona igual en Windows, Mac y Linux.
 */
const BIN = {
  next: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
  tsx: path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
};

/** Ejecuta un script de Node y espera a que termine. */
function runNode(script, args, label) {
  const res = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: ENV,
    stdio: "inherit",
  });
  if (res.status !== 0) {
    line("");
    line(`✖ Falló: ${label}`);
    throw new Error(label);
  }
}

/** Solo para `npm install`, que sí necesita shell en Windows. */
function runShell(command, label) {
  const res = spawnSync(command, { cwd: ROOT, env: ENV, stdio: "inherit", shell: true });
  if (res.status !== 0) {
    line("");
    line(`✖ Falló: ${label}`);
    process.exit(res.status ?? 1);
  }
}

/**
 * `embedded-postgres` no está en package.json a propósito: pesa bastante (trae
 * los binarios de PostgreSQL) y en producción no pinta nada. Se instala aquí,
 * solo si hace falta, y sin tocar package.json.
 */
function ensureEmbeddedPostgres() {
  const require = createRequire(import.meta.url);
  try {
    require.resolve("embedded-postgres");
    return true; // ya estaba instalado, no hay que hacer nada más
  } catch {
    title("Descargando PostgreSQL portátil (solo la primera vez)");
    line("  Son unos 100 MB. Puede tardar unos minutos según tu conexión.");
    line("");
    runShell("npm install --no-save --no-audit --no-fund embedded-postgres", "descarga de PostgreSQL portátil");
    return false; // se acaba de instalar en este momento
  }
}

async function main() {
  const yaEstabaInstalado = ensureEmbeddedPostgres();

  if (!yaEstabaInstalado) {
    /**
     * En algunos equipos (visto en Windows con Node 24), este mismo proceso
     * de Node conserva en memoria la resolución fallida de "embedded-postgres"
     * de justo antes de instalarlo, y un `import()` inmediato dentro del
     * mismo proceso falla con "Cannot find package" aunque el archivo ya
     * exista en el disco. Para evitarlo por completo, en vez de seguir en
     * este proceso, se relanza uno completamente nuevo: ese sí parte de cero
     * y ve el paquete recién instalado sin ningún problema.
     */
    line("");
    line("Instalado. Reiniciando para continuar con un proceso limpio…");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      env: ENV,
      stdio: "inherit",
    });
    const reenviar = (señal) => {
      try {
        child.kill(señal);
      } catch {
        /* ya había muerto */
      }
    };
    process.on("SIGINT", () => reenviar("SIGINT"));
    process.on("SIGTERM", () => reenviar("SIGTERM"));
    process.on("SIGHUP", () => reenviar("SIGHUP"));
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres");

  mkdirSync(path.join(ROOT, "storage", "receipts"), { recursive: true });
  const primeraVez = !existsSync(DATA_DIR);

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: PORT,
    persistent: true, // los datos sobreviven entre arranques
    onLog: () => {}, // el log de PostgreSQL no aporta nada aquí
    onError: () => {},
  });

  title("Preparando la base de datos");
  if (primeraVez) {
    line("  Creando el almacén de datos en .postgres-demo/ …");
    await pg.initialise();
  }
  await pg.start();
  line("  PostgreSQL listo.");

  if (primeraVez) {
    await pg.createDatabase(DB_NAME);
    line(`  Base de datos «${DB_NAME}» creada.`);
  }

  /**
   * Apagado ordenado. Mata primero la aplicación y después PostgreSQL, y es
   * a prueba de llamadas repetidas: en una terminal real, Ctrl+C llega a la
   * vez al padre y al hijo, así que esto se invoca dos veces.
   */
  let app = null;
  let cerrando = false;
  const apagar = async (code = 0) => {
    if (cerrando) return;
    cerrando = true;
    line("");
    line("Apagando…");
    if (app && app.exitCode === null) {
      try {
        app.kill("SIGTERM");
      } catch {
        /* ya había muerto */
      }
    }
    try {
      await pg.stop();
      line("PostgreSQL detenido. Hasta luego.");
    } catch {
      /* ya estaba apagado */
    }
    process.exit(code);
  };
  process.on("SIGINT", () => void apagar(0));
  process.on("SIGTERM", () => void apagar(0));
  process.on("SIGHUP", () => void apagar(0));

  try {
    title("Aplicando el esquema");
    runNode(BIN.tsx, ["src/db/migrate.ts"], "migraciones");

    title("Creando el administrador y el catálogo de ejemplo");
    runNode(BIN.tsx, ["src/db/seed.ts"], "datos iniciales");
  } catch (e) {
    line(String(e?.message ?? e));
    await apagar(1);
    return;
  }

  title("Listo — abre  http://localhost:3000");
  line("");
  line("  Panel de administración:  http://localhost:3000/admin");
  line(`     usuario:    ${ENV.SEED_ADMIN_EMAIL}`);
  line(`     contraseña: ${ENV.SEED_ADMIN_PASSWORD}`);
  line("");
  line("  Para apagar todo: Ctrl + C");
  line("──────────────────────────────────────────────────────");
  line("");

  app = spawn(process.execPath, [BIN.next, "dev", "-p", "3000"], {
    cwd: ROOT,
    env: ENV,
    stdio: "inherit",
  });

  app.on("exit", (code) => void apagar(code ?? 0));
}

main().catch(async (e) => {
  console.error("");
  console.error("✖ No se pudo arrancar la demostración:");
  console.error(e?.message ?? e);
  process.exit(1);
});
