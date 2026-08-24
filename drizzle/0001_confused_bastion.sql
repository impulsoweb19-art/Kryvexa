CREATE TYPE "public"."verification_purpose" AS ENUM('PASSWORD_RESET');--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"purpose" "verification_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verification_codes_user_purpose_idx" ON "verification_codes" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "verification_codes_expires_idx" ON "verification_codes" USING btree ("expires_at");