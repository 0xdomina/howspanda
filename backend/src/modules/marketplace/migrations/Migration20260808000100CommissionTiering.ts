import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260808000100CommissionTiering extends Migration {

  override async up(): Promise<void> {
    // Platform-wide move from a flat 10% to a tiered 3–5% schedule. The
    // seller column becomes an optional override: NULL = use the tiered
    // schedule. Existing sellers were all at the old 10% — clear them so the
    // tiered schedule applies immediately.
    this.addSql(`alter table if exists "seller" alter column "commission_rate" drop default;`);
    this.addSql(`alter table if exists "seller" alter column "commission_rate" drop not null;`);
    this.addSql(`update "seller" set "commission_rate" = null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "seller" set "commission_rate" = 0.1;`);
    this.addSql(`alter table if exists "seller" alter column "commission_rate" set default 0.1;`);
    this.addSql(`alter table if exists "seller" alter column "commission_rate" set not null;`);
  }

}