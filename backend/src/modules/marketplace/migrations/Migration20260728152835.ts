import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260728152835 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_admin" drop constraint if exists "seller_admin_email_unique";`);
    this.addSql(`alter table if exists "commission_line" drop constraint if exists "commission_line_order_id_unique";`);
    this.addSql(`alter table if exists "seller" drop constraint if exists "seller_handle_unique";`);
    this.addSql(`create table if not exists "seller" ("id" text not null, "handle" text not null, "name" text not null, "logo" text null, "description" text null, "verification_status" text check ("verification_status" in ('unverified', 'pending', 'verified')) not null default 'unverified', "commission_rate" real not null default 0.1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_handle_unique" ON "seller" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_deleted_at" ON "seller" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "commission_line" ("id" text not null, "order_id" text not null, "currency_code" text not null, "order_total" numeric not null, "rate" real not null, "commission_amount" numeric not null, "net_amount" numeric not null, "status" text check ("status" in ('pending', 'paid')) not null default 'pending', "seller_id" text not null, "raw_order_total" jsonb not null, "raw_commission_amount" jsonb not null, "raw_net_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commission_line_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_commission_line_order_id_unique" ON "commission_line" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_line_seller_id" ON "commission_line" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_line_deleted_at" ON "commission_line" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seller_admin" ("id" text not null, "first_name" text null, "last_name" text null, "email" text not null, "seller_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_admin_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_admin_email_unique" ON "seller_admin" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_seller_id" ON "seller_admin" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_admin_deleted_at" ON "seller_admin" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "commission_line" add constraint "commission_line_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller_admin" add constraint "seller_admin_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "commission_line" drop constraint if exists "commission_line_seller_id_foreign";`);

    this.addSql(`alter table if exists "seller_admin" drop constraint if exists "seller_admin_seller_id_foreign";`);

    this.addSql(`drop table if exists "seller" cascade;`);

    this.addSql(`drop table if exists "commission_line" cascade;`);

    this.addSql(`drop table if exists "seller_admin" cascade;`);
  }

}
