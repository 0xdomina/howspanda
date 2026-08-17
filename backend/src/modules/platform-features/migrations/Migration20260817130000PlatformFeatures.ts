import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260817130000PlatformFeatures extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "platform_feature" ("id" text not null, "key" text not null, "label" text not null, "description" text null, "enabled" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "platform_feature_pkey" primary key ("id"));`
    )
    this.addSql(
      `create unique index if not exists "IDX_platform_feature_key_unique" on "platform_feature" ("key") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_platform_feature_deleted_at" on "platform_feature" ("deleted_at") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "platform_feature" cascade;`)
  }
}
