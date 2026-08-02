import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260802120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "buyer_withdrawal_account" ("id" text not null, "buyer_email" text not null, "type" text check ("type" in ('bank_account', 'crypto_address')) not null, "currency_code" text not null default 'ngn', "bank_code" text null, "account_number" text null, "account_name" text null, "recipient_code" text null, "network" text null, "address" text null, "is_default" boolean not null default false, "status" text check ("status" in ('unverified', 'verified', 'failed')) not null default 'unverified', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "buyer_withdrawal_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_withdrawal_account_buyer_email" ON "buyer_withdrawal_account" ("buyer_email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_withdrawal_account_deleted_at" ON "buyer_withdrawal_account" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "buyer_withdrawal" ("id" text not null, "wallet_id" text not null, "currency_code" text not null, "amount" numeric not null, "rail" text check ("rail" in ('paystack', 'crypto-usdc')) not null, "status" text check ("status" in ('requested', 'processing', 'paid', 'failed', 'reversed')) not null default 'requested', "idempotency_key" text not null, "provider_reference" text null, "destination" jsonb not null, "failure_reason" text null, "attempts" integer not null default 0, "paid_at" timestamptz null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "buyer_withdrawal_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_buyer_withdrawal_idempotency_key_unique" ON "buyer_withdrawal" ("idempotency_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_withdrawal_wallet_id" ON "buyer_withdrawal" ("wallet_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_withdrawal_deleted_at" ON "buyer_withdrawal" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "buyer_withdrawal" add constraint "buyer_withdrawal_wallet_id_foreign" foreign key ("wallet_id") references "buyer_wallet" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "buyer_withdrawal" cascade;`);

    this.addSql(`drop table if exists "buyer_withdrawal_account" cascade;`);
  }

}
