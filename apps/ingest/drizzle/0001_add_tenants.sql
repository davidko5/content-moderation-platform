CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "tenants" ("id", "name") VALUES ('00000000-0000-0000-0000-000000000001', 'default') ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "content" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;