import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260809151000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "auth_otp" drop constraint if exists "auth_otp_purpose_check";`)
    this.addSql(`alter table if exists "auth_otp" add constraint "auth_otp_purpose_check" check ("purpose" in ('signup', 'reset', 'email_change'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "auth_otp" where "purpose" = 'email_change';`)
    this.addSql(`alter table if exists "auth_otp" drop constraint if exists "auth_otp_purpose_check";`)
    this.addSql(`alter table if exists "auth_otp" add constraint "auth_otp_purpose_check" check ("purpose" in ('signup', 'reset'));`)
  }
}
