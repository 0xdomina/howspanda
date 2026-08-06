import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" add column if not exists "role" text not null default 'owner';`);
    this.addSql(`alter table if exists "seller_admin" add column if not exists "auth_identity_id" text null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_auth_identity_id" ON "seller_admin" ("auth_identity_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_seller_admin_auth_identity_id";`);
    this.addSql(`alter table if exists "seller_admin" drop column if exists "auth_identity_id";`);
    this.addSql(`alter table if exists "seller_admin" drop column if exists "role";`);
  }

}
