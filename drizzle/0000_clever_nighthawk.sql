CREATE TYPE "public"."deposit_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('GAME_PACKAGE', 'PIN', 'RECHARGE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."tx_direction" AS ENUM('CREDIT', 'DEBIT');--> statement-breakpoint
CREATE TYPE "public"."tx_reason" AS ENUM('DEPOSIT_APPROVED', 'ORDER_PAYMENT', 'ORDER_REFUND', 'ADMIN_ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"actor_id" text,
	"actor_email" varchar(255),
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" text,
	"meta_json" jsonb,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"code" varchar(24) NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" varchar(16) DEFAULT 'YAPE' NOT NULL,
	"operation_code" varchar(40),
	"receipt_path" text NOT NULL,
	"receipt_mime" varchar(64) NOT NULL,
	"receipt_size" integer NOT NULL,
	"status" "deposit_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"code" varchar(24) NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text,
	"provider_code" varchar(40) NOT NULL,
	"product_name" varchar(160) NOT NULL,
	"game_name" varchar(120) NOT NULL,
	"product_kind" "product_kind" NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"price_cents" integer NOT NULL,
	"cost_usd_cents" integer NOT NULL,
	"inputs" jsonb NOT NULL,
	"player_nickname" varchar(120),
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"provider_reference" varchar(64),
	"provider_tx_id" varchar(64),
	"result_json" jsonb,
	"failure_code" varchar(48),
	"failure_message" text,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"provider_code" varchar(40) NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"kind" "product_kind" NOT NULL,
	"sku" varchar(64),
	"game_name" varchar(120) NOT NULL,
	"package_name" varchar(160) NOT NULL,
	"description" text,
	"cost_usd_cents" integer NOT NULL,
	"price_cents" integer,
	"margin_bps" integer,
	"input_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_supported" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_transactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"order_id" text,
	"provider_code" varchar(40) NOT NULL,
	"operation" varchar(40) NOT NULL,
	"method" varchar(8) NOT NULL,
	"endpoint" text NOT NULL,
	"request_body" jsonb,
	"response_body" jsonb,
	"http_status" integer,
	"ok" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"code" varchar(40) PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"base_url" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(30),
	"role" "role" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"wallet_id" text NOT NULL,
	"direction" "tx_direction" NOT NULL,
	"reason" "tx_reason" NOT NULL,
	"amount_cents" integer NOT NULL,
	"balance_after_cents" integer NOT NULL,
	"description" text,
	"ref_type" varchar(24),
	"ref_id" text,
	"idempotency_key" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"pending_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_transactions" ADD CONSTRAINT "provider_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_requests_code_key" ON "deposit_requests" USING btree ("code");--> statement-breakpoint
CREATE INDEX "deposit_requests_status_idx" ON "deposit_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "deposit_requests_user_idx" ON "deposit_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_code_key" ON "orders" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_key" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_provider_reference_idx" ON "orders" USING btree ("provider_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "products_provider_kind_external_key" ON "products" USING btree ("provider_code","kind","external_id");--> statement-breakpoint
CREATE INDEX "products_listing_idx" ON "products" USING btree ("visible","active","sort_order");--> statement-breakpoint
CREATE INDEX "provider_tx_order_idx" ON "provider_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "provider_tx_provider_created_idx" ON "provider_transactions" USING btree ("provider_code","created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_expires_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_tx_idempotency_key" ON "wallet_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "wallet_tx_wallet_created_idx" ON "wallet_transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_tx_ref_idx" ON "wallet_transactions" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets" USING btree ("user_id");