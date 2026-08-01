import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801142219 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mkt_mall" ("id" text not null, "name" text not null, "description" text null, "created_by_seller_id" text not null, "status" text check ("status" in ('pending', 'active', 'settling', 'expired', 'cancelled', 'closed')) not null default 'pending', "target_sellers" integer not null default 5, "target_buyers" integer not null default 10, "prize_winner_count" integer not null default 3, "prize_distribution" text check ("prize_distribution" in ('equal', 'random')) not null default 'equal', "prize_pool_ngn" numeric not null default 0, "contributed_ngn" numeric not null default 0, "remaining_ngn" numeric not null default 0, "starts_at" timestamptz null, "ends_at" timestamptz null, "expires_at" timestamptz not null, "raw_prize_pool_ngn" jsonb not null default '{"value":"0","precision":20}', "raw_contributed_ngn" jsonb not null default '{"value":"0","precision":20}', "raw_remaining_ngn" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_mall_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_deleted_at" ON "mkt_mall" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_mall_buyer" ("id" text not null, "mall_id" text not null, "buyer_email" text not null, "joined_at" timestamptz not null, "purchase_count" integer not null default 0, "has_won" boolean not null default false, "won_prize_ngn" numeric null, "won_at" timestamptz null, "raw_won_prize_ngn" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_mall_buyer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_buyer_mall_id" ON "mkt_mall_buyer" ("mall_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_buyer_deleted_at" ON "mkt_mall_buyer" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_mall_prize" ("id" text not null, "mall_id" text not null, "winner_buyer_email" text not null, "amount_ngn" numeric not null, "is_random" boolean not null default true, "redeemable_id" text null, "random_seed" text null, "wallet_ledger_id" text null, "claimed" boolean not null default false, "claimed_at" timestamptz null, "raw_amount_ngn" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_mall_prize_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_prize_mall_id" ON "mkt_mall_prize" ("mall_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_prize_deleted_at" ON "mkt_mall_prize" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_mall_seller" ("id" text not null, "mall_id" text not null, "seller_id" text not null, "contribution_ngn" numeric not null, "redeemable_id" text null, "joined_at" timestamptz not null, "raw_contribution_ngn" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_mall_seller_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_seller_mall_id" ON "mkt_mall_seller" ("mall_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_seller_deleted_at" ON "mkt_mall_seller" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "mkt_mall_buyer" add constraint "mkt_mall_buyer_mall_id_foreign" foreign key ("mall_id") references "mkt_mall" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_mall_prize" add constraint "mkt_mall_prize_mall_id_foreign" foreign key ("mall_id") references "mkt_mall" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_mall_seller" add constraint "mkt_mall_seller_mall_id_foreign" foreign key ("mall_id") references "mkt_mall" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mkt_mall_buyer" drop constraint if exists "mkt_mall_buyer_mall_id_foreign";`);

    this.addSql(`alter table if exists "mkt_mall_prize" drop constraint if exists "mkt_mall_prize_mall_id_foreign";`);

    this.addSql(`alter table if exists "mkt_mall_seller" drop constraint if exists "mkt_mall_seller_mall_id_foreign";`);

    this.addSql(`drop table if exists "mkt_mall" cascade;`);

    this.addSql(`drop table if exists "mkt_mall_buyer" cascade;`);

    this.addSql(`drop table if exists "mkt_mall_prize" cascade;`);

    this.addSql(`drop table if exists "mkt_mall_seller" cascade;`);
  }

}
