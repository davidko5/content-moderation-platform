CREATE TYPE "public"."decision_enum" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"decision" "decision_enum" NOT NULL,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
