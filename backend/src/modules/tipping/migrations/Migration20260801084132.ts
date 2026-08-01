import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801084132 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "tip" add column if not exists "redeemable_id" text null, add column if not exists "redeemable_code" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "tip" drop column if exists "redeemable_id", drop column if exists "redeemable_code";`);
  }

}
