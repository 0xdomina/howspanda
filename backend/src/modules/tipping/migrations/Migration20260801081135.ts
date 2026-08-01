import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801081135 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tip" ("id" text not null, "direction" text check ("direction" in ('to_seller', 'to_buyer')) not null, "order_id" text null, "buyer_email" text not null, "seller_id" text not null, "currency_code" text not null default 'ngn', "amount" numeric null, "product_id" text null, "product_title" text null, "note" text null, "status" text check ("status" in ('available', 'reversed')) not null default 'available', "commission_line_id" text null, "buyer_credit_status" text check ("buyer_credit_status" in ('issued', 'redeemed', 'voided')) null, "buyer_credit_code" text null, "raw_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "tip_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_tip_deleted_at" ON "tip" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tip" cascade;`);
  }

}
