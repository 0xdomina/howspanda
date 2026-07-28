import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260728212850 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "ai_quota" drop constraint if exists "ai_quota_seller_id_unique";`);
    this.addSql(`create table if not exists "ai_quota" ("id" text not null, "seller_id" text not null, "monthly_limit" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_quota_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ai_quota_seller_id_unique" ON "ai_quota" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_quota_deleted_at" ON "ai_quota" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ai_usage" ("id" text not null, "seller_id" text not null, "capability" text not null, "model_id" text not null, "prompt_tokens" integer null, "completion_tokens" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_usage_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_deleted_at" ON "ai_usage" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_usage_seller_id" ON "ai_usage" ("seller_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_quota" cascade;`);

    this.addSql(`drop table if exists "ai_usage" cascade;`);
  }

}
