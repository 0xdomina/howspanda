import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260802090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" drop constraint if exists "seller_admin_email_unique";`);
    this.addSql(`alter table if exists "seller_admin" add column if not exists "phone" text null;`);
    this.addSql(`alter table if exists "seller_admin" alter column "email" drop not null;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_admin_email_unique" ON "seller_admin" ("email") WHERE deleted_at IS NULL AND email IS NOT NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_phone" ON "seller_admin" ("phone") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" drop column if exists "phone";`);
    this.addSql(`alter table if exists "seller_admin" alter column "email" set not null;`);
  }

}
