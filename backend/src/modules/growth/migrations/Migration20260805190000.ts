import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805190000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mkt_challenge" ("id" text not null, "name" text not null, "slug" text not null, "description" text null, "type" text check ("type" in ('invite', 'arc_pool')) not null, "audience" text check ("audience" in ('sellers', 'buyers', 'all')) not null default 'all', "status" text check ("status" in ('draft', 'live', 'ended')) not null default 'draft', "starts_at" timestamptz null, "ends_at" timestamptz null, "config" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_challenge_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mkt_challenge_slug_unique" ON "mkt_challenge" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_deleted_at" ON "mkt_challenge" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_challenge_participant" ("id" text not null, "challenge_id" text not null, "actor_type" text check ("actor_type" in ('seller', 'buyer')) not null, "seller_id" text null, "buyer_email" text null, "score" numeric not null default 0, "raw_score" jsonb not null default '{"value":"0","precision":20}', "meta" jsonb null, "claimed" boolean not null default false, "claimed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_challenge_participant_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_participant_challenge_id" ON "mkt_challenge_participant" ("challenge_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_participant_deleted_at" ON "mkt_challenge_participant" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mkt_challenge_reward" ("id" text not null, "challenge_id" text not null, "participant_id" text not null, "kind" text check ("kind" in ('buyer_credit', 'seller_credit')) not null, "amount" numeric not null, "raw_amount" jsonb not null, "currency_code" text not null default 'ngn', "status" text check ("status" in ('issued', 'claimed', 'voided')) not null default 'issued', "reference" text null, "issued_at" timestamptz not null, "claimed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_challenge_reward_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_reward_challenge_id" ON "mkt_challenge_reward" ("challenge_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_reward_participant_id" ON "mkt_challenge_reward" ("participant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_challenge_reward_deleted_at" ON "mkt_challenge_reward" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "mkt_challenge_participant" add constraint "mkt_challenge_participant_challenge_id_foreign" foreign key ("challenge_id") references "mkt_challenge" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_challenge_reward" add constraint "mkt_challenge_reward_challenge_id_foreign" foreign key ("challenge_id") references "mkt_challenge" ("id") on update cascade;`);

    this.addSql(`alter table if exists "mkt_challenge_reward" add constraint "mkt_challenge_reward_participant_id_foreign" foreign key ("participant_id") references "mkt_challenge_participant" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mkt_challenge_participant" drop constraint if exists "mkt_challenge_participant_challenge_id_foreign";`);

    this.addSql(`alter table if exists "mkt_challenge_reward" drop constraint if exists "mkt_challenge_reward_challenge_id_foreign";`);

    this.addSql(`alter table if exists "mkt_challenge_reward" drop constraint if exists "mkt_challenge_reward_participant_id_foreign";`);

    this.addSql(`drop table if exists "mkt_challenge" cascade;`);

    this.addSql(`drop table if exists "mkt_challenge_participant" cascade;`);

    this.addSql(`drop table if exists "mkt_challenge_reward" cascade;`);
  }

}
