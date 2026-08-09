import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260809000400MallParticipation extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "mkt_mall_seller" add column if not exists "product_ids" jsonb null;`
    )
    this.addSql(
      `alter table if exists "mkt_mall_seller" add column if not exists "contribution_ledger_id" text null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "mkt_mall_seller" drop column if exists "product_ids";`
    )
    this.addSql(
      `alter table if exists "mkt_mall_seller" drop column if exists "contribution_ledger_id";`
    )
  }
}
