/**
 * Datos iniciales: administrador, proveedor y configuración por defecto.
 * Es idempotente: puede ejecutarse varias veces sin duplicar nada.
 *
 *   npm run db:seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { mockGameProducts, mockPinProducts } from "@/server/providers/recargas-america/mock";

const DEFAULT_SETTINGS: Record<string, unknown> = {
  storeName: "KRYVEXA",
  yapeHolderName: "",
  yapePhone: "",
  yapeInstructions:
    "Yapea el monto exacto al número indicado y sube la captura del comprobante. La acreditación es manual y suele tardar pocos minutos en horario de atención.",
  yapeQrPath: null,
  supportWhatsapp: "",
  supportEmail: "",
  // Redes de la tienda. Editables en Panel → Configuración.
  socialWhatsappChannel: "https://whatsapp.com/channel/0029Vb6GrauHQbRzETYsT40E",
  socialTiktok: "https://www.tiktok.com/@kryvexa_",
  socialInstagram: "",
  exchangeRate: 3.8,
  marginBps: 2500,
  minDepositCents: 500,
  purchasesEnabled: true,
  providerLowBalanceUsdCents: 2000,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  const name = process.env.SEED_ADMIN_NAME ?? "Administrador";

  if (!email || password.length < 8) {
    throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 8 caracteres) en .env");
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  // ── Proveedor ─────────────────────────────────────────────────────────────
  await db
    .insert(schema.providers)
    .values({
      code: "recargas_america",
      name: "RecargasAmérica",
      baseUrl: process.env.RECARGAS_AMERICA_BASE_URL ?? "https://panel.recargasamerica.com/api/v1",
      enabled: true,
      notes: "Proveedor principal de la v1 (Free Fire).",
    })
    .onConflictDoNothing({ target: schema.providers.code });

  await db
    .insert(schema.providers)
    .values({
      code: "manual",
      name: "Entrega manual",
      baseUrl: "",
      enabled: true,
      notes: "Productos que el administrador entrega a mano (ver Catálogo).",
    })
    .onConflictDoNothing({ target: schema.providers.code });

  await db
    .insert(schema.providers)
    .values({
      code: "epinby",
      name: "EpinBy",
      baseUrl: process.env.EPINBY_BASE_URL ?? "https://epinby.com/api/v1",
      enabled: true,
      notes: "Mobile Legends.",
    })
    .onConflictDoNothing({ target: schema.providers.code });

  // ── Configuración ─────────────────────────────────────────────────────────
  const settingsToSeed: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  // En modo demostración rellenamos los datos de Yape con valores de ejemplo
  // para que la pantalla de recarga se vea completa. SON FICTICIOS: cámbialos
  // en Configuración antes de que entre nadie de verdad.
  if (process.env.SEED_DEMO_CATALOG === "true") {
    settingsToSeed.yapeHolderName = "NOMBRE DE EJEMPLO — cámbialo";
    settingsToSeed.yapePhone = "999 999 999";
    settingsToSeed.supportWhatsapp = "51999999999";
    settingsToSeed.supportEmail = "soporte@ejemplo.com";
  }

  for (const [key, value] of Object.entries(settingsToSeed)) {
    await db
      .insert(schema.settings)
      .values({ key, valueJson: sql`${JSON.stringify(value ?? null)}::jsonb` })
      .onConflictDoNothing({ target: schema.settings.key });
  }

  // ── Administrador ─────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  if (existing[0]) {
    console.log(`El administrador ${email} ya existe; no se modifica su contraseña.`);
    console.log("Para cambiar su correo o contraseña, entra a la web y ve a «Mi cuenta».");
  } else {
    // Aviso útil, no un error: si ya hay administradores y este seed crea uno
    // nuevo (porque SEED_ADMIN_EMAIL cambió), conviene saberlo para no dejar
    // cuentas con acceso total olvidadas por ahí.
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(schema.users)
      .where(sql`${schema.users.role} = 'ADMIN'`);
    if (Number(total) > 0) {
      console.log(`Aviso: ya había ${total} administrador(es). Se va a crear uno más: ${email}.`);
      console.log("Si no era tu intención, suspende el que no uses desde Panel → Usuarios.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [admin] = await db
      .insert(schema.users)
      .values({ email, name, passwordHash, role: "ADMIN", status: "ACTIVE" })
      .returning();
    await db.insert(schema.wallets).values({ userId: admin.id });
    console.log(`Administrador creado: ${email}`);
    console.log("Entra a la web, ve a «Mi cuenta» y cambia esa contraseña.");
  }

  // ── Catálogo de demostración ──────────────────────────────────────────────
  // Solo con SEED_DEMO_CATALOG=true. Sirve para que la tienda no aparezca vacía
  // al levantar el proyecto por primera vez sin API key. En producción NO se usa:
  // el catálogo real llega por /api/cron/sync-catalog.
  if (process.env.SEED_DEMO_CATALOG === "true") {
    const demo = [
      ...mockGameProducts.map((p) => ({
        externalId: String(p.id),
        kind: "GAME_PACKAGE" as const,
        gameName: p.game,
        packageName: p.package,
        costUsdCents: Math.round(p.price * 100),
        inputFields: p.input_fields ?? [],
        validationSupported: false,
      })),
      ...mockPinProducts.map((p) => {
        const isRecharge = String(p.type ?? "pin").toLowerCase() === "recharge";
        return {
          externalId: String(p.id),
          kind: isRecharge ? ("RECHARGE" as const) : ("PIN" as const),
          gameName: "Free Fire",
          packageName: p.name,
          costUsdCents: Math.round(p.price * 100),
          inputFields: isRecharge
            ? [{ name: "redemption_id", label: "ID de jugador", type: "number" }]
            : [{ name: "quantity", label: "Cantidad", type: "number" }],
          validationSupported: isRecharge,
        };
      }),
    ];

    for (const item of demo) {
      await db
        .insert(schema.products)
        .values({
          providerCode: "recargas_america",
          externalId: item.externalId,
          kind: item.kind,
          gameName: item.gameName,
          packageName: item.packageName,
          costUsdCents: item.costUsdCents,
          inputFields: sql`${JSON.stringify(item.inputFields)}::jsonb`,
          validationSupported: item.validationSupported,
          sortOrder: Math.min(9999, Math.round(item.costUsdCents / 100)),
          lastSyncedAt: new Date(),
        })
        .onConflictDoNothing();
    }
    console.log(`Catálogo de demostración: ${demo.length} productos.`);
  }

  // ── Productos de entrega manual ───────────────────────────────────────────
  // Estos SÍ son productos reales del negocio (no un catálogo de ejemplo): se
  // crean siempre, en demo y en producción. No los toca "Sincronizar ahora"
  // (eso solo sincroniza providerCode="recargas_america"). El administrador
  // entrega cada pedido a mano y luego lo marca "Entregado" en /admin/pedidos;
  // el precio de venta se puede ajustar en cualquier momento desde Catálogo,
  // igual que con los demás productos.
  const MANUAL_INPUTS = [
    { name: "input1", label: "Player ID" },
    { name: "input2", label: "Server ID" },
  ];

  // Cajas y Fragmentos Evo se entregan solo con el ID de jugador (sin Server ID).
  const EVO_INPUTS = [{ name: "input1", label: "Player ID" }];

  const manualProducts: Array<{
    externalId: string;
    packageName: string;
    costSoles: number;
    /** Si se define, fija el precio de venta exacto en vez de calcularlo por margen. */
    priceSoles?: number;
    inputs?: typeof MANUAL_INPUTS;
  }> = [
    { externalId: "manual-pase-booyah", packageName: "Pase Booyah", costSoles: 3.0 },
    { externalId: "manual-membresia-semanal", packageName: "Membresía Semanal", costSoles: 6.5 },
    { externalId: "manual-membresia-mensual", packageName: "Membresía Mensual", costSoles: 28.9 },
    // Precios de venta fijos según la lista de precios del negocio (cajas y
    // fragmentos, sin las demás secciones de esa lista que no son de este catálogo).
    { externalId: "manual-cajas-evo-20", packageName: "20 Cajas Evo", costSoles: 14.0, priceSoles: 17.5, inputs: EVO_INPUTS },
    { externalId: "manual-cajas-evo-30", packageName: "30 Cajas Evo", costSoles: 22.0, priceSoles: 27.5, inputs: EVO_INPUTS },
    { externalId: "manual-cajas-evo-60", packageName: "60 Cajas Evo", costSoles: 36.0, priceSoles: 45.0, inputs: EVO_INPUTS },
    { externalId: "manual-cajas-evo-120", packageName: "120 Cajas Evo", costSoles: 56.8, priceSoles: 71.0, inputs: EVO_INPUTS },
    { externalId: "manual-cajas-evo-240", packageName: "240 Cajas Evo", costSoles: 110.4, priceSoles: 138.0, inputs: EVO_INPUTS },
    { externalId: "manual-fragmentos-evo-99", packageName: "99 Fragmentos Evo", costSoles: 14.0, priceSoles: 17.5, inputs: EVO_INPUTS },
    { externalId: "manual-fragmentos-evo-150", packageName: "150 Fragmentos Evo", costSoles: 22.0, priceSoles: 27.5, inputs: EVO_INPUTS },
    { externalId: "manual-fragmentos-evo-300", packageName: "300 Fragmentos Evo", costSoles: 36.0, priceSoles: 45.0, inputs: EVO_INPUTS },
    { externalId: "manual-fragmentos-evo-600", packageName: "600 Fragmentos Evo", costSoles: 56.8, priceSoles: 71.0, inputs: EVO_INPUTS },
    { externalId: "manual-fragmentos-evo-1200", packageName: "1200 Fragmentos Evo", costSoles: 110.4, priceSoles: 138.0, inputs: EVO_INPUTS },
  ];

  for (const item of manualProducts) {
    // El costo real es en soles; se guarda como equivalente en dólares
    // (÷ 3.8, el tipo de cambio por defecto) para que la calculadora de
    // precios automáticos del panel funcione igual que con los demás
    // productos. El administrador puede fijar el precio que quiera después.
    const costUsdCents = Math.round((item.costSoles / 3.8) * 100);
    const priceCents = item.priceSoles != null ? Math.round(item.priceSoles * 100) : null;

    await db
      .insert(schema.products)
      .values({
        providerCode: "manual",
        externalId: item.externalId,
        kind: "GAME_PACKAGE",
        gameName: "Free Fire — Entrega manual",
        packageName: item.packageName,
        costUsdCents,
        priceCents,
        inputFields: sql`${JSON.stringify(item.inputs ?? MANUAL_INPUTS)}::jsonb`,
        validationSupported: false,
        sortOrder: Math.min(9999, Math.round(costUsdCents / 100)),
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing();
  }
  console.log(`Productos de entrega manual: ${manualProducts.length}.`);

  await pool.end();
}

main().catch((e) => {
  console.error("Fallo en el seed:", e);
  process.exit(1);
});
