import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260819090200ProductRequests extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "product_request" ("id" text not null, "customer_id" text not null, "buyer_email" text not null, "seller_id" text not null, "request" text not null, "status" text check ("status" in ('open', 'reviewing', 'available', 'not_available', 'closed')) not null default 'open', "seller_note" text null, "product_id" text null, "responded_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_request_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_product_request_customer_created" on "product_request" ("customer_id", "created_at" desc) where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_product_request_seller_status" on "product_request" ("seller_id", "status", "created_at" desc) where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_request" cascade;`)
  }
}
