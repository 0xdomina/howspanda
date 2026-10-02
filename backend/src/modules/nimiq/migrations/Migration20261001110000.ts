import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261001110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "nimiq_payout" ("id" text not null, "order_id" text not null, "quote_id" text not null, "token" text check ("token" in ('USDT', 'NIM')) not null, "network" text not null, "destination" text not null, "amount_token_base" numeric not null, "status" text check ("status" in ('requested', 'sent', 'confirmed', 'failed')) not null default 'requested', "tx_hash" text null, "attempts" integer not null default 0, "last_error" text null, "confirmed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "nimiq_payout_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_nimiq_payout_order" on "nimiq_payout" ("order_id") where "deleted_at" is null;`)
    this.addSql(`create unique index if not exists "IDX_nimiq_payout_tx_hash_unique" on "nimiq_payout" ("tx_hash") where "deleted_at" is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "nimiq_payout" cascade;`)
  }
}
