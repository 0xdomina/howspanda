import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261001100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "nimiq_quote" alter column "buyer_email" drop not null;`)
    this.addSql(`alter table if exists "nimiq_quote" add column if not exists "payer_address" text null;`)
    this.addSql(`alter table if exists "nimiq_quote" add column if not exists "cart_id" text null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "nimiq_quote" drop column if exists "cart_id";`)
    this.addSql(`alter table if exists "nimiq_quote" drop column if exists "payer_address";`)
  }
}
