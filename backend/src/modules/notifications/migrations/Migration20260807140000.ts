import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260807140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "notification_outbox" ("id" text not null, "kind" text not null, "channel" text check ("channel" in ('email')) not null default 'email', "recipient" text not null, "recipient_id" text null, "to" text not null, "subject" text null, "body_html" text null, "payload" jsonb null, "status" text check ("status" in ('pending', 'sent', 'failed')) not null default 'pending', "attempts" integer not null default 0, "last_error" text null, "next_attempt_at" timestamptz null, "sent_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "notification_outbox_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_notification_outbox_pending" ON "notification_outbox" ("status", "next_attempt_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_notification_outbox_recipient" ON "notification_outbox" ("recipient") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_outbox" cascade;`);
  }

}
