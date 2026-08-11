import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260810090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "payment_proof" ("id" text not null, "order_id" text not null, "seller_id" text not null, "buyer_email" text not null, "reference" text not null, "status" text check ("status" in ('awaiting_proof', 'submitted', 'confirmed', 'rejected', 'expired')) not null default 'awaiting_proof', "currency_code" text not null default 'ngn', "amount" numeric null, "raw_amount" jsonb null, "bank" jsonb null, "proof_url" text null, "buyer_note" text null, "rejection_note" text null, "recheck_until" timestamptz null, "submitted_at" timestamptz null, "confirmed_at" timestamptz null, "rejected_at" timestamptz null, "expired_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_proof_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_proof_order" ON "payment_proof" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_proof_seller" ON "payment_proof" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_proof_recheck" ON "payment_proof" ("status", "recheck_until") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_proof" cascade;`);
  }

}
