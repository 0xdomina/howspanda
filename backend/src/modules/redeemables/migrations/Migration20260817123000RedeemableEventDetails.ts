import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260817123000RedeemableEventDetails extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table if exists "redeemable" add column if not exists "event_name" text null;')
    this.addSql('alter table if exists "redeemable" add column if not exists "venue_name" text null;')
    this.addSql('alter table if exists "redeemable" add column if not exists "venue_address" text null;')
    this.addSql('alter table if exists "redeemable" add column if not exists "event_starts_at" timestamptz null;')
    this.addSql('alter table if exists "redeemable" add column if not exists "event_ends_at" timestamptz null;')
  }

  async down(): Promise<void> {
    this.addSql('alter table if exists "redeemable" drop column if exists "event_name";')
    this.addSql('alter table if exists "redeemable" drop column if exists "venue_name";')
    this.addSql('alter table if exists "redeemable" drop column if exists "venue_address";')
    this.addSql('alter table if exists "redeemable" drop column if exists "event_starts_at";')
    this.addSql('alter table if exists "redeemable" drop column if exists "event_ends_at";')
  }
}
