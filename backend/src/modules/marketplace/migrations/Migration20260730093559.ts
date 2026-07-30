import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260730093559 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "payout" drop constraint if exists "payout_idempotency_key_unique";`);
    this.addSql(`create table if not exists "payout_account" ("id" text not null, "type" text check ("type" in ('bank_account', 'crypto_address')) not null, "currency_code" text not null default 'ngn', "bank_code" text null, "account_number" text null, "account_name" text null, "recipient_code" text null, "network" text null, "address" text null, "is_default" boolean not null default false, "status" text check ("status" in ('unverified', 'verified', 'failed')) not null default 'unverified', "seller_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_account_seller_id" ON "payout_account" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_account_deleted_at" ON "payout_account" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "payout" ("id" text not null, "currency_code" text not null, "amount" numeric not null, "rail" text check ("rail" in ('paystack', 'crypto-usdc')) not null, "status" text check ("status" in ('requested', 'processing', 'paid', 'failed', 'reversed')) not null default 'requested', "idempotency_key" text not null, "provider_reference" text null, "destination" jsonb not null, "failure_reason" text null, "attempts" integer not null default 0, "requested_by" text check ("requested_by" in ('seller', 'admin', 'schedule')) not null default 'seller', "paid_at" timestamptz null, "seller_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payout_idempotency_key_unique" ON "payout" ("idempotency_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_seller_id" ON "payout" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_deleted_at" ON "payout" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "payout_account" add constraint "payout_account_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "payout" add constraint "payout_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "commission_line" drop constraint if exists "commission_line_status_check";`);

    this.addSql(`alter table if exists "commission_line" add column if not exists "available_at" timestamptz null, add column if not exists "payout_id" text null, add column if not exists "reversal_reason" text null;`);
    this.addSql(`alter table if exists "commission_line" add constraint "commission_line_status_check" check("status" in ('pending', 'available', 'reserved', 'paid', 'reversed'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payout_account" cascade;`);

    this.addSql(`drop table if exists "payout" cascade;`);

    this.addSql(`alter table if exists "commission_line" drop constraint if exists "commission_line_status_check";`);

    this.addSql(`alter table if exists "commission_line" drop column if exists "available_at", drop column if exists "payout_id", drop column if exists "reversal_reason";`);

    this.addSql(`alter table if exists "commission_line" add constraint "commission_line_status_check" check("status" in ('pending', 'paid'));`);
  }

}
