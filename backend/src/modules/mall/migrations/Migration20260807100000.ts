import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Mall purchase records: one lottery entry per (mall, order). The unique
// index on (mall_id, order_id) makes replaying the same order idempotent so a
// buyer cannot re-roll the lottery with the same purchase.
export class Migration20260807100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "mkt_mall_purchase" ("id" text not null, "mall_id" text not null, "order_id" text not null, "buyer_email" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mkt_mall_purchase_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mkt_mall_purchase_order_unique" ON "mkt_mall_purchase" ("mall_id", "order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_purchase_mall_id" ON "mkt_mall_purchase" ("mall_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mkt_mall_purchase_deleted_at" ON "mkt_mall_purchase" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`alter table if exists "mkt_mall_purchase" add constraint "mkt_mall_purchase_mall_id_foreign" foreign key ("mall_id") references "mkt_mall" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "mkt_mall_purchase" drop constraint if exists "mkt_mall_purchase_mall_id_foreign";`);
    this.addSql(`drop table if exists "mkt_mall_purchase" cascade;`);
  }

}
