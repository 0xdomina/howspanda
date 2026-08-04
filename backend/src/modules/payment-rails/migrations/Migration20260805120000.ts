import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "payment_rail" ("id" text not null, "key" text not null, "provider_id" text not null, "label" text not null, "kind" text check ("kind" in ('fiat-card', 'crypto', 'manual')) not null, "enabled" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payment_rail_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_rail_key_unique" ON "payment_rail" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payment_rail_deleted_at" ON "payment_rail" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payment_rail" cascade;`);
  }

}
