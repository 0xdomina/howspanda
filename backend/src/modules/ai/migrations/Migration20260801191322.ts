import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801191322 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ai_brief" ("id" text not null, "seller_id" text not null, "period" text not null, "period_start" timestamptz null, "period_end" timestamptz null, "numbers" jsonb not null, "opportunities" jsonb null, "narrative" text null, "generated_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_brief_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_brief_deleted_at" ON "ai_brief" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_brief_seller_id_period" ON "ai_brief" ("seller_id", "period") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_brief" cascade;`);
  }

}
