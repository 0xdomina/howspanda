import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260731085231 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "redeemable" drop constraint if exists "redeemable_code_unique";`);
    this.addSql(`create table if not exists "redeemable" ("id" text not null, "seller_id" text not null, "type" text check ("type" in ('gift_card', 'voucher', 'ticket')) not null, "code" text not null, "status" text check ("status" in ('active', 'redeemed', 'cancelled', 'expired')) not null default 'active', "currency_code" text not null default 'ngn', "title" text not null, "face_value" numeric null, "balance" numeric null, "discount_type" text check ("discount_type" in ('fixed', 'percent')) null, "discount_value" real null, "price" numeric null, "product_id" text null, "expires_at" timestamptz null, "issued_to_email" text null, "source_order_id" text null, "raw_face_value" jsonb null, "raw_balance" jsonb null, "raw_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "redeemable_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_redeemable_code_unique" ON "redeemable" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_redeemable_deleted_at" ON "redeemable" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "redemption" ("id" text not null, "amount_applied" numeric not null, "order_id" text null, "channel" text check ("channel" in ('checkout', 'in_store')) not null, "redeemable_id" text not null, "raw_amount_applied" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "redemption_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_redemption_redeemable_id" ON "redemption" ("redeemable_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_redemption_deleted_at" ON "redemption" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "redemption" add constraint "redemption_redeemable_id_foreign" foreign key ("redeemable_id") references "redeemable" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "redemption" drop constraint if exists "redemption_redeemable_id_foreign";`);

    this.addSql(`drop table if exists "redeemable" cascade;`);

    this.addSql(`drop table if exists "redemption" cascade;`);
  }

}
