import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260804120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "auth_otp" ("id" text not null, "email" text not null, "purpose" text check ("purpose" in ('signup', 'reset')) not null, "channel" text check ("channel" in ('email', 'phone')) not null default 'email', "destination" text not null, "code_hash" text not null, "code_tail" text not null, "status" text check ("status" in ('active', 'used', 'expired')) not null default 'active', "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "auth_otp_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_auth_otp_deleted_at" ON "auth_otp" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_auth_otp_email_purpose" ON "auth_otp" ("email", "purpose") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "auth_otp" cascade;`);
  }

}
