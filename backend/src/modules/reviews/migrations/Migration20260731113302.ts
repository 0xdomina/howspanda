import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260731113302 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "review" drop constraint if exists "review_order_id_unique";`);
    this.addSql(`create table if not exists "review" ("id" text not null, "seller_id" text not null, "order_id" text not null, "buyer_email" text not null, "rating" integer not null, "comment" text null, "status" text check ("status" in ('published', 'removed')) not null default 'published', "removed_reason" text null, "reply_body" text null, "replied_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "review_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_review_order_id_unique" ON "review" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_review_deleted_at" ON "review" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_rating" ("id" text not null, "product_id" text not null, "rating" integer not null, "review_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_rating_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_rating_review_id" ON "product_rating" ("review_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_rating_deleted_at" ON "product_rating" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "product_rating" add constraint "product_rating_review_id_foreign" foreign key ("review_id") references "review" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_rating" drop constraint if exists "product_rating_review_id_foreign";`);

    this.addSql(`drop table if exists "review" cascade;`);

    this.addSql(`drop table if exists "product_rating" cascade;`);
  }

}
