import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801082759 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "referral" drop constraint if exists "referral_code_unique";`);
    this.addSql(`create table if not exists "referral" ("id" text not null, "code" text not null, "referrer_role" text check ("referrer_role" in ('seller')) not null default 'seller', "referrer_seller_id" text not null, "referee_email" text null, "status" text check ("status" in ('pending', 'qualified')) not null default 'pending', "reward_amount" numeric null, "currency_code" text not null default 'ngn', "capped_reason" text null, "qualified_at" timestamptz null, "paid_commission_line_id" text null, "raw_reward_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "referral_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_referral_code_unique" ON "referral" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_referral_deleted_at" ON "referral" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "referral" cascade;`);
  }

}
