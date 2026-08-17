import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260817120000MallIntegrity extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "mkt_mall_prize" add column if not exists "winner_slot" integer null;`
    )
    // Existing prize rows predate winner slots. Assign their creation order so
    // the new guard can be enabled without discarding reward history.
    this.addSql(
      `with ranked as (select id, row_number() over (partition by mall_id order by created_at, id) - 1 as slot from "mkt_mall_prize" where deleted_at is null) update "mkt_mall_prize" p set winner_slot = ranked.slot from ranked where p.id = ranked.id and p.winner_slot is null;`
    )
    this.addSql(
      `create unique index if not exists "IDX_mkt_mall_prize_winner_slot_unique" on "mkt_mall_prize" ("mall_id", "winner_slot") where deleted_at is null and winner_slot is not null;`
    )
    this.addSql(
      `create unique index if not exists "IDX_mkt_mall_buyer_identity_unique" on "mkt_mall_buyer" ("mall_id", lower("buyer_email")) where deleted_at is null;`
    )
    this.addSql(
      `create unique index if not exists "IDX_mkt_mall_seller_identity_unique" on "mkt_mall_seller" ("mall_id", "seller_id") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_mkt_mall_seller_identity_unique";`)
    this.addSql(`drop index if exists "IDX_mkt_mall_buyer_identity_unique";`)
    this.addSql(`drop index if exists "IDX_mkt_mall_prize_winner_slot_unique";`)
    this.addSql(`alter table if exists "mkt_mall_prize" drop column if exists "winner_slot";`)
  }
}
