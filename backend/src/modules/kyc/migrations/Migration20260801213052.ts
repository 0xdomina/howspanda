import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801213052 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" drop constraint if exists "kyc_profile_email_unique";`);
    this.addSql(`create table if not exists "kyc_otp" ("id" text not null, "email" text not null, "channel" text check ("channel" in ('email', 'phone')) not null, "destination" text not null, "code_hash" text not null, "code_tail" text not null, "status" text check ("status" in ('active', 'used', 'expired')) not null default 'active', "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "kyc_otp_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_kyc_otp_deleted_at" ON "kyc_otp" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "kyc_profile" ("id" text not null, "email" text not null, "phone" text null, "phone_verified_at" timestamptz null, "id_type" text null, "id_tail" text null, "id_status" text check ("id_status" in ('none', 'pending', 'verified', 'rejected')) not null default 'none', "id_submitted_at" timestamptz null, "id_reviewed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "kyc_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_kyc_profile_email_unique" ON "kyc_profile" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_kyc_profile_deleted_at" ON "kyc_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "kyc_otp" cascade;`);

    this.addSql(`drop table if exists "kyc_profile" cascade;`);
  }

}
