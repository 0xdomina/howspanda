import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260814091000RedeemableDesign extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "redeemable" add column if not exists "design_variant" text not null default 'sunset';`)
    this.addSql(`alter table if exists "redeemable" add column if not exists "background_image" text null;`)
    this.addSql(`alter table if exists "redeemable" add column if not exists "accent_color" text null;`)
    this.addSql(`alter table if exists "redeemable" add column if not exists "message" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "redeemable" drop column if exists "design_variant";`)
    this.addSql(`alter table if exists "redeemable" drop column if exists "background_image";`)
    this.addSql(`alter table if exists "redeemable" drop column if exists "accent_color";`)
    this.addSql(`alter table if exists "redeemable" drop column if exists "message";`)
  }
}
