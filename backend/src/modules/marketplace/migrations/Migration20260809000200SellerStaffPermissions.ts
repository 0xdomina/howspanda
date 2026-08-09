import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260809000200SellerStaffPermissions extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "seller_admin" add column if not exists "permissions" jsonb null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "seller_admin" drop column if exists "permissions";`
    )
  }
}
