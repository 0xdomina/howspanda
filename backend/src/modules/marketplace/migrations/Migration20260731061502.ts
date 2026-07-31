import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260731061502 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "commission_line" add column if not exists "parent_order_id" text null, add column if not exists "delivered_at" timestamptz null, add column if not exists "confirmed_at" timestamptz null, add column if not exists "release_due_at" timestamptz null, add column if not exists "held_at" timestamptz null, add column if not exists "hold_reason" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "commission_line" drop column if exists "parent_order_id", drop column if exists "delivered_at", drop column if exists "confirmed_at", drop column if exists "release_due_at", drop column if exists "held_at", drop column if exists "hold_reason";`);
  }

}
