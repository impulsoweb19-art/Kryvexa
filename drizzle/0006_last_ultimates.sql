CREATE TABLE "provider_breakers" (
	"provider_code" varchar(40) PRIMARY KEY NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"last_failure_kind" varchar(32),
	"last_failure_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
