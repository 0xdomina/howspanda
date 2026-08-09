import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260809000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ai_conversation" ("id" text not null, "actor_type" text not null, "actor_id" text not null, "title" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_conversation_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_conversation_deleted_at" ON "ai_conversation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_conversation_actor_type_actor_id" ON "ai_conversation" ("actor_type", "actor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ai_message" ("id" text not null, "conversation_id" text not null, "role" text not null, "content" text not null, "provider" text null, "model_id" text null, "input_tokens" integer null, "output_tokens" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ai_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_message_deleted_at" ON "ai_message" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ai_message_conversation_id" ON "ai_message" ("conversation_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "ai_message" add constraint "ai_message_conversation_id_foreign" foreign key ("conversation_id") references "ai_conversation" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "ai_message" drop constraint if exists "ai_message_conversation_id_foreign";`);

    this.addSql(`drop table if exists "ai_conversation" cascade;`);

    this.addSql(`drop table if exists "ai_message" cascade;`);
  }

}
