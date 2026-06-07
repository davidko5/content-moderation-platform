CREATE TYPE "public"."content_status_enum" AS ENUM('pending', 'approved', 'rejected', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."content_type_enum" AS ENUM('text', 'image');--> statement-breakpoint
CREATE TABLE "content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "content_type_enum" NOT NULL,
	"text" varchar(10000) NOT NULL,
	"status" "content_status_enum" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
