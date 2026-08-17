import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260817121000TipIntegrity extends Migration {
  override async up(): Promise<void> {
    // One buyer-to-seller cash tip per order. The partial predicate keeps
    // historical reversed records auditable without blocking a corrected tip.
    this.addSql(
      `create unique index if not exists "IDX_tip_buyer_order_unique" on "tip" ("order_id", lower("buyer_email"), "seller_id") where deleted_at is null and direction = 'to_seller' and order_id is not null and status <> 'reversed';`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_tip_buyer_order_unique";`)
  }
}
