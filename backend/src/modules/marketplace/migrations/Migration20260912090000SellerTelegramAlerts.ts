import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260912090000SellerTelegramAlerts extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "telegram_chat_id" text null;`)
    this.addSql(`alter table if exists "seller" add column if not exists "telegram_link_code" text null;`)
    this.addSql(`alter table if exists "seller" add column if not exists "telegram_link_expires_at" timestamptz null;`)
    this.addSql(`create index if not exists "IDX_seller_telegram_link_code" on "seller" ("telegram_link_code");`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_seller_telegram_link_code";`)
    this.addSql(`alter table if exists "seller" drop column if exists "telegram_link_expires_at";`)
    this.addSql(`alter table if exists "seller" drop column if exists "telegram_link_code";`)
    this.addSql(`alter table if exists "seller" drop column if exists "telegram_chat_id";`)
  }
}
