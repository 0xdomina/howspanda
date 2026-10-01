import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260930130000OrderShipped extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "commission_line" add column if not exists "shipped_at" timestamptz null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "commission_line" drop column if exists "shipped_at";`)
  }
}
