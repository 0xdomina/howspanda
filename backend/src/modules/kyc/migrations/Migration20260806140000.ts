import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// KYC ladder: personal profile fields (names as on the ID + residence address)
// collected as part of the progressive ladder. phone_verified + a complete
// profile = the profile_completed level, which is what unlocks seller and
// courier features. All columns are nullable so the ladder stays progressive —
// nothing is required up front, each rung is added by the user.
export class Migration20260806140000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "first_name" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "last_name" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "other_name" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "address" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "country" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "state" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "city" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "postal_code" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "first_name";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "last_name";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "other_name";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "address";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "country";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "state";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "city";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "postal_code";`);
  }

}
