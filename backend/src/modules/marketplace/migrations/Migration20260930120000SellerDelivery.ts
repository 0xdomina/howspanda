import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260930120000SellerDelivery extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "delivery_fee" integer null;`)
    this.addSql(`alter table if exists "seller" add column if not exists "free_delivery" boolean not null default false;`)
    this.addSql(`alter table if exists "seller" add column if not exists "pickup_address" text null;`)
    this.addSql(`alter table if exists "payment_proof" add column if not exists "delivery_mode" text null;`)
    this.addSql(`alter table if exists "payment_proof" add column if not exists "delivery_fee" integer null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "payment_proof" drop column if exists "delivery_fee";`)
    this.addSql(`alter table if exists "payment_proof" drop column if exists "delivery_mode";`)
    this.addSql(`alter table if exists "seller" drop column if exists "pickup_address";`)
    this.addSql(`alter table if exists "seller" drop column if exists "free_delivery";`)
    this.addSql(`alter table if exists "seller" drop column if exists "delivery_fee";`)
  }
}
