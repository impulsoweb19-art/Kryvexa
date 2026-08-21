/**
 * Esquema de base de datos (PostgreSQL vía Drizzle ORM).
 *
 * REGLAS DE DISEÑO
 *  1. Todo importe se guarda en ENTEROS (céntimos). Nunca float.
 *       *Cents     → PEN  (billetera del usuario, precio de venta)
 *       *UsdCents  → USD  (precio del proveedor, nuestro costo)
 *  2. El saldo NUNCA se modifica sin insertar el asiento correspondiente en
 *     `wallet_transactions`. Invariante verificable:
 *       SUM(CREDIT) - SUM(DEBIT) === wallets.balance_cents
 *  3. Toda operación que mueve dinero lleva `idempotency_key` UNIQUE.
 *  4. `orders` y `products` llevan `provider_code`: añadir un segundo proveedor
 *     no requiere migrar datos.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["USER", "ADMIN"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);
export const txDirectionEnum = pgEnum("tx_direction", ["CREDIT", "DEBIT"]);
export const txReasonEnum = pgEnum("tx_reason", [
  "DEPOSIT_APPROVED",
  "ORDER_PAYMENT",
  "ORDER_REFUND",
  "ADMIN_ADJUSTMENT",
]);
export const depositStatusEnum = pgEnum("deposit_status", ["PENDING", "APPROVED", "REJECTED"]);
export const productKindEnum = pgEnum("product_kind", [
  "GAME_PACKAGE", // /products/games  → /buy/games
  "PIN", // /products/pins (type=pin)      → /buy/pins {quantity}
  "RECHARGE", // /products/pins (type=recharge) → /buy/pins {redemption_id}
]);
/** Estados INTERNOS. No son los del proveedor: el mapper traduce. */
export const orderStatusEnum = pgEnum("order_status", [
  "PENDING", // esperando confirmación del proveedor
  "PROCESSING", // saldo descontado, llamada en curso
  "COMPLETED", // entregada
  "FAILED", // falló (ya reembolsada)
  "CANCELLED", // anulada antes de cobrar
  "REFUNDED", // saldo devuelto
  "NEEDS_REVIEW", // resultado desconocido tras N intentos → revisión humana
]);

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ─── Usuarios y sesiones ─────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    role: roleEnum("role").notNull().default("USER"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(sql`lower(${t.email})`),
    index("users_status_idx").on(t.status),
    index("users_created_at_idx").on(t.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 del token que viaja en la cookie: si roban la BD no pueden suplantar sesiones. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_key").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

// ─── Billetera interna (NUESTRA, no la del proveedor) ────────────────────────

export const wallets = pgTable(
  "wallets",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Saldo disponible en céntimos de PEN. Solo lo escribe walletService. */
    balanceCents: integer("balance_cents").notNull().default(0),
    /** Suma de depósitos en revisión. Informativo, no gastable. */
    pendingCents: integer("pending_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("PEN"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("wallets_user_id_key").on(t.userId)],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: id(),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    direction: txDirectionEnum("direction").notNull(),
    reason: txReasonEnum("reason").notNull(),
    /** Siempre positivo. El signo lo aporta `direction`. */
    amountCents: integer("amount_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    description: text("description"),
    refType: varchar("ref_type", { length: 24 }), // "deposit" | "order" | "admin"
    refId: text("ref_id"),
    /** UNIQUE: reintentar la misma operación jamás duplica dinero. */
    idempotencyKey: text("idempotency_key").notNull(),
    createdById: text("created_by_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("wallet_tx_idempotency_key").on(t.idempotencyKey),
    index("wallet_tx_wallet_created_idx").on(t.walletId, t.createdAt),
    index("wallet_tx_ref_idx").on(t.refType, t.refId),
  ],
);

// ─── Depósitos por Yape (acreditación manual) ────────────────────────────────

export const depositRequests = pgTable(
  "deposit_requests",
  {
    id: id(),
    code: varchar("code", { length: 24 }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: varchar("method", { length: 16 }).notNull().default("YAPE"),
    operationCode: varchar("operation_code", { length: 40 }),
    /** Ruta RELATIVA dentro de RECEIPTS_DIR. Nunca accesible públicamente. */
    receiptPath: text("receipt_path").notNull(),
    receiptMime: varchar("receipt_mime", { length: 64 }).notNull(),
    receiptSize: integer("receipt_size").notNull(),
    status: depositStatusEnum("status").notNull().default("PENDING"),
    rejectionReason: text("rejection_reason"),
    reviewedById: text("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deposit_requests_code_key").on(t.code),
    index("deposit_requests_status_idx").on(t.status, t.createdAt),
    index("deposit_requests_user_idx").on(t.userId, t.createdAt),
  ],
);

// ─── Proveedores externos ────────────────────────────────────────────────────

export const providers = pgTable("providers", {
  code: varchar("code", { length: 40 }).primaryKey(), // "recargas_america"
  name: varchar("name", { length: 80 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  baseUrl: text("base_url").notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Caché local del catálogo. Se refresca por cron, no en cada visita del usuario. */
export const products = pgTable(
  "products",
  {
    id: id(),
    providerCode: varchar("provider_code", { length: 40 }).notNull(),
    /** `id` que devuelve la API del proveedor. */
    externalId: varchar("external_id", { length: 64 }).notNull(),
    kind: productKindEnum("kind").notNull(),
    sku: varchar("sku", { length: 64 }),
    gameName: varchar("game_name", { length: 120 }).notNull(),
    packageName: varchar("package_name", { length: 160 }).notNull(),
    description: text("description"),
    /** `price` del proveedor en céntimos de USD. Es nuestro COSTO. */
    costUsdCents: integer("cost_usd_cents").notNull(),
    /** Precio de venta fijo en PEN. Null → se calcula con tipo de cambio + margen. */
    priceCents: integer("price_cents"),
    /** Margen propio en basis points (1000 = 10%). Null → usa el margen global. */
    marginBps: integer("margin_bps"),
    /** input_fields tal cual: [{ "name":"input1", "label":"Player ID" }] */
    inputFields: jsonb("input_fields").notNull().default(sql`'[]'::jsonb`),
    /**
     * true SOLO si el proveedor documenta validación previa para este producto.
     * Hoy: únicamente kind=RECHARGE vía POST /pins/validate.
     * Los GAME_PACKAGE no tienen endpoint de validación documentado.
     */
    validationSupported: boolean("validation_supported").notNull().default(false),
    active: boolean("active").notNull().default(true), // lo reporta el proveedor
    visible: boolean("visible").notNull().default(true), // lo decide el admin
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_provider_kind_external_key").on(t.providerCode, t.kind, t.externalId),
    index("products_listing_idx").on(t.visible, t.active, t.sortOrder),
  ],
);

// ─── Órdenes ─────────────────────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: id(),
    code: varchar("code", { length: 24 }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    providerCode: varchar("provider_code", { length: 40 }).notNull(),

    // Snapshot: el catálogo cambia, la orden no.
    productName: varchar("product_name", { length: 160 }).notNull(),
    gameName: varchar("game_name", { length: 120 }).notNull(),
    productKind: productKindEnum("product_kind").notNull(),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    priceCents: integer("price_cents").notNull(),
    costUsdCents: integer("cost_usd_cents").notNull(),

    /** {"input1":"123456789","input2":"3001"} o {"redemption_id":"..."} */
    inputs: jsonb("inputs").notNull(),
    /** account_name devuelto por /pins/validate, si hubo validación. */
    playerNickname: varchar("player_nickname", { length: 120 }),

    status: orderStatusEnum("status").notNull().default("PENDING"),
    providerReference: varchar("provider_reference", { length: 64 }),
    providerTxId: varchar("provider_tx_id", { length: 64 }),
    resultJson: jsonb("result_json"),
    failureCode: varchar("failure_code", { length: 48 }),
    failureMessage: text("failure_message"),

    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_code_key").on(t.code),
    /** El escudo contra el doble clic: dos POST con la misma clave → una sola orden. */
    uniqueIndex("orders_idempotency_key").on(t.idempotencyKey),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_provider_reference_idx").on(t.providerReference),
  ],
);

/** Bitácora cruda de cada llamada al proveedor, con secretos redactados. */
export const providerTransactions = pgTable(
  "provider_transactions",
  {
    id: id(),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    providerCode: varchar("provider_code", { length: 40 }).notNull(),
    operation: varchar("operation", { length: 40 }).notNull(),
    method: varchar("method", { length: 8 }).notNull(),
    endpoint: text("endpoint").notNull(),
    requestBody: jsonb("request_body"),
    responseBody: jsonb("response_body"),
    httpStatus: integer("http_status"),
    ok: boolean("ok").notNull().default(false),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("provider_tx_order_idx").on(t.orderId),
    index("provider_tx_provider_created_idx").on(t.providerCode, t.createdAt),
  ],
);

// ─── Configuración, auditoría y rate limiting ────────────────────────────────

export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  valueJson: jsonb("value_json").notNull(),
  updatedAt: updatedAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 255 }),
    action: varchar("action", { length: 64 }).notNull(), // "deposit.approve"
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: text("entity_id"),
    metaJson: jsonb("meta_json"),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_created_idx").on(t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** Rate limiting persistente (ventana fija). No depende de la memoria del proceso. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 160 }).primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_expires_idx").on(t.expiresAt)],
);

// ─── Relaciones ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, { fields: [users.id], references: [wallets.userId] }),
  sessions: many(sessions),
  orders: many(orders),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, { fields: [wallets.userId], references: [users.id] }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(wallets, { fields: [walletTransactions.walletId], references: [wallets.id] }),
}));

export const depositRequestsRelations = relations(depositRequests, ({ one }) => ({
  user: one(users, { fields: [depositRequests.userId], references: [users.id] }),
  reviewer: one(users, { fields: [depositRequests.reviewedById], references: [users.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
  providerTransactions: many(providerTransactions),
}));

// ─── Tipos inferidos ─────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type DepositRequest = typeof depositRequests.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type ProductKind = (typeof productKindEnum.enumValues)[number];
export type DepositStatus = (typeof depositStatusEnum.enumValues)[number];
