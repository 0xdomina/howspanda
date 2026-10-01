import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261001090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "nimiq_quote" ("id" text not null, "buyer_email" text not null, "token" text check ("token" in ('USDT', 'NIM')) not null, "network" text not null, "amount_token_base" numeric not null, "amount_ngn_minor" integer not null, "merchant_address" text not null, "reference" text not null, "status" text check ("status" in ('quoted', 'paid', 'expired', 'failed')) not null default 'quoted', "items" jsonb null, "expires_at" timestamptz not null, "tx_hash" text null, "verified_at" timestamptz null, "order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "nimiq_quote_pkey" primary key ("id"));`)
    this.addSql(`create unique index if not exists "IDX_nimiq_quote_reference_unique" on "nimiq_quote" ("reference") where "deleted_at" is null;`)
    this.addSql(`create unique index if not exists "IDX_nimiq_quote_tx_hash_unique" on "nimiq_quote" ("tx_hash") where "deleted_at" is null;`)
    this.addSql(`create index if not exists "IDX_nimiq_quote_status" on "nimiq_quote" ("status") where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "nimiq_quote" cascade;`)
  }
}
