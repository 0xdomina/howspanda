import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "store_follow" ("id" text not null, "seller_id" text not null, "customer_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_follow_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_store_follow_seller_customer_unique" ON "store_follow" ("seller_id", "customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_follow_seller" ON "store_follow" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_follow_customer" ON "store_follow" ("customer_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "store_broadcast" ("id" text not null, "seller_id" text not null, "type" text check ("type" in ('general', 'product', 'offer', 'voucher', 'giveaway')) not null, "title" text not null, "body" text not null, "product_id" text null, "voucher_code" text null, "discount_type" text check ("discount_type" in ('fixed', 'percent')) null, "discount_value" double precision null, "giveaway_claims_count" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "store_broadcast_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_store_broadcast_seller_created" ON "store_broadcast" ("seller_id", "created_at" DESC) WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "app_notification" ("id" text not null, "customer_id" text not null, "kind" text check ("kind" in ('store_broadcast', 'giveaway_claimed')) not null, "broadcast_id" text null, "seller_id" text null, "actor_label" text null, "actor_handle" text null, "title" text not null, "body" text not null, "payload" jsonb null, "read_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "app_notification_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_app_notification_customer_created" ON "app_notification" ("customer_id", "created_at" DESC) WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_app_notification_unread" ON "app_notification" ("customer_id") WHERE deleted_at IS NULL AND read_at IS NULL;`);

    this.addSql(`create table if not exists "giveaway_claim" ("id" text not null, "broadcast_id" text not null, "customer_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "giveaway_claim_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_giveaway_claim_broadcast_customer_unique" ON "giveaway_claim" ("broadcast_id", "customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "giveaway_claim" cascade;`);
    this.addSql(`drop table if exists "app_notification" cascade;`);
    this.addSql(`drop table if exists "store_broadcast" cascade;`);
    this.addSql(`drop table if exists "store_follow" cascade;`);
  }

}