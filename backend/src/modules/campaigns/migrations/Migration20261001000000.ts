import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261001000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mkt_campaign" ("id" text not null, "name" text not null, "slug" text not null, "sponsor" text null, "status" text check ("status" in ('draft', 'live', 'paused', 'ended')) not null default 'draft', "starts_at" timestamptz null, "ends_at" timestamptz null, "claim_until" timestamptz null, "audience" text check ("audience" in ('sellers', 'buyers', 'all')) not null default 'all', "store_ids" jsonb null, "event" text check ("event" in ('visit', 'first_transaction', 'any_transaction', 'store_creation', 'referral_qualified')) not null, "rules" jsonb null, "reward_template" jsonb null, "pool_ngn" numeric not null default 0, "raw_pool_ngn" jsonb not null default '{"value":"0","precision":20}', "per_user_cap_ngn" numeric null, "raw_per_user_cap_ngn" jsonb null, "global_cap_ngn" numeric null, "raw_global_cap_ngn" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_campaign_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mkt_campaign_slug_unique" ON "mkt_campaign" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_deleted_at" ON "mkt_campaign" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_campaign_participant" ("id" text not null, "campaign_id" text not null, "actor_type" text check ("actor_type" in ('seller', 'buyer')) not null, "seller_id" text null, "buyer_email" text null, "score" numeric not null default 0, "raw_score" jsonb not null default '{"value":"0","precision":20}', "events" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_campaign_participant_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_participant_campaign_id" ON "mkt_campaign_participant" ("campaign_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_participant_deleted_at" ON "mkt_campaign_participant" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_campaign_reward" ("id" text not null, "campaign_id" text not null, "participant_id" text not null, "kind" text check ("kind" in ('wallet_credit', 'seller_credit', 'giftcard_fixed', 'voucher_fixed')) not null, "amount" numeric not null, "raw_amount" jsonb not null, "currency_code" text not null default 'ngn', "status" text check ("status" in ('issued', 'claimed', 'expired', 'voided')) not null default 'issued', "reference" text null, "issued_at" timestamptz not null, "claimed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_campaign_reward_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_reward_campaign_id" ON "mkt_campaign_reward" ("campaign_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_reward_participant_id" ON "mkt_campaign_reward" ("participant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_reward_reference" ON "mkt_campaign_reward" ("reference") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_campaign_reward_deleted_at" ON "mkt_campaign_reward" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "mkt_campaign_participant" add constraint "mkt_campaign_participant_campaign_id_foreign" foreign key ("campaign_id") references "mkt_campaign" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_campaign_reward" add constraint "mkt_campaign_reward_campaign_id_foreign" foreign key ("campaign_id") references "mkt_campaign" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_campaign_reward" add constraint "mkt_campaign_reward_participant_id_foreign" foreign key ("participant_id") references "mkt_campaign_participant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mkt_campaign_participant" drop constraint if exists "mkt_campaign_participant_campaign_id_foreign";`);

    this.addSql(`alter table if exists "mkt_campaign_reward" drop constraint if exists "mkt_campaign_reward_campaign_id_foreign";`);

    this.addSql(`alter table if exists "mkt_campaign_reward" drop constraint if exists "mkt_campaign_reward_participant_id_foreign";`);

    this.addSql(`drop table if exists "mkt_campaign" cascade;`);

    this.addSql(`drop table if exists "mkt_campaign_participant" cascade;`);

    this.addSql(`drop table if exists "mkt_campaign_reward" cascade;`);
  }

}
