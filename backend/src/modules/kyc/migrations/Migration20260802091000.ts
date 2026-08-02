import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260802091000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" drop constraint if exists "kyc_profile_email_unique";`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "email_verified_at" timestamptz null;`);
    this.addSql(`alter table if exists "kyc_profile" alter column "email" drop not null;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_kyc_profile_email_unique" ON "kyc_profile" ("email") WHERE deleted_at IS NULL AND email IS NOT NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_kyc_profile_phone" ON "kyc_profile" ("phone") WHERE deleted_at IS NULL AND phone IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "email_verified_at";`);
    this.addSql(`alter table if exists "kyc_profile" alter column "email" set not null;`);
  }

}
