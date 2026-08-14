import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260814090000SellerStorefrontBranding extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller" add column if not exists "cover_image" text null;`)
    this.addSql(`alter table if exists "seller" add column if not exists "accent_color" text not null default '#ef4444';`)
    this.addSql(`alter table if exists "seller" add column if not exists "theme" text not null default 'sunset';`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller" drop column if exists "cover_image";`)
    this.addSql(`alter table if exists "seller" drop column if exists "accent_color";`)
    this.addSql(`alter table if exists "seller" drop column if exists "theme";`)
  }
}
