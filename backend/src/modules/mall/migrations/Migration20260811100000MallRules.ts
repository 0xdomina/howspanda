import { Migration } from "@medusajs/framework/mikro-orm/migrations"

// Mall rules are platform-wide: five sellers and ten buyers launch a mall,
// then its fixed ten-day shopping lifespan starts. Pending malls do not count
// down while they are gathering participants.
export class Migration20260811100000MallRules extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "mkt_mall" alter column "expires_at" drop not null;`
    )
    this.addSql(
      `update "mkt_mall" set "target_sellers" = 5, "target_buyers" = 10, "prize_distribution" = 'equal';`
    )
    this.addSql(
      `update "mkt_mall" set "expires_at" = null where "status" = 'pending';`
    )
    this.addSql(
      `update "mkt_mall" set "expires_at" = coalesce("starts_at", "created_at") + interval '10 days' where "status" in ('active', 'settling') and "starts_at" is not null;`
    )
  }

  override async down(): Promise<void> {
    // Existing rows may contain pending malls without an expiration date, so
    // this rule migration intentionally has no destructive rollback.
  }
}
