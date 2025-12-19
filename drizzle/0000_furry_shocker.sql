CREATE TABLE "clause_comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"comparison_id" text NOT NULL,
	"clause_type" text NOT NULL,
	"source_clause_id" text,
	"target_clause_id" text,
	"diff_summary" text,
	"risk_score" real,
	"risk_factors" text,
	"deviation_percentage" real,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clauses" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"clause_type" text NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"start_position" integer,
	"end_position" integer,
	"page_number" integer,
	"confidence_score" real,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text,
	"source_contract_id" text NOT NULL,
	"target_contract_id" text NOT NULL,
	"comparison_type" text,
	"comparison_status" text DEFAULT 'pending' NOT NULL,
	"overall_risk_score" real,
	"summary" text,
	"semantic_tags" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"filename" text NOT NULL,
	"object_id" text,
	"content_type" text,
	"raw_text" text,
	"ingestion_status" text DEFAULT 'pending' NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"template_type" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"vault_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"name" text NOT NULL,
	"template_type" text,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clause_comparisons" ADD CONSTRAINT "clause_comparisons_comparison_id_comparisons_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparisons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_comparisons" ADD CONSTRAINT "clause_comparisons_source_clause_id_clauses_id_fk" FOREIGN KEY ("source_clause_id") REFERENCES "public"."clauses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clause_comparisons" ADD CONSTRAINT "clause_comparisons_target_clause_id_clauses_id_fk" FOREIGN KEY ("target_clause_id") REFERENCES "public"."clauses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clauses" ADD CONSTRAINT "clauses_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_source_contract_id_contracts_id_fk" FOREIGN KEY ("source_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_target_contract_id_contracts_id_fk" FOREIGN KEY ("target_contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;