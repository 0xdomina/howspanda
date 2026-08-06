import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// KYC is platform-wide and lives on the USER, not on a loose contact string.
// This anchors each kyc_profile to the account that owns it (customer or
// seller_admin) via (user_type, user_id), keeping email/phone as the verified
// contact + OTP key. One profile per user — enforced by the partial unique
// index. Existing rows are backfilled best-effort by matching email, guarded
// so the migration never depends on another module's table existing yet.
export class Migration20260806130000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "user_type" text null;`);
    this.addSql(`alter table if exists "kyc_profile" add column if not exists "user_id" text null;`);

    this.addSql(`DO $$ BEGIN
      IF to_regclass('public.seller_admin') IS NOT NULL THEN
        UPDATE "kyc_profile" SET "user_type" = 'seller', "user_id" = sa.id
        FROM "seller_admin" sa
        WHERE "kyc_profile"."user_id" IS NULL
          AND "kyc_profile"."email" IS NOT NULL
          AND lower(sa.email) = lower("kyc_profile"."email");
      END IF;
      IF to_regclass('public.customer') IS NOT NULL THEN
        UPDATE "kyc_profile" SET "user_type" = 'customer', "user_id" = c.id
        FROM "customer" c
        WHERE "kyc_profile"."user_id" IS NULL
          AND "kyc_profile"."email" IS NOT NULL
          AND lower(c.email) = lower("kyc_profile"."email");
      END IF;
    END $$;`);

    this.addSql(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kyc_profile_user_type_check'
      ) THEN
        ALTER TABLE "kyc_profile" ADD CONSTRAINT "kyc_profile_user_type_check"
          CHECK ("user_type" IN ('customer', 'seller'));
      END IF;
    END $$;`);

    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_kyc_profile_user_unique" ON "kyc_profile" ("user_type", "user_id") WHERE deleted_at IS NULL AND user_id IS NOT NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_kyc_profile_user_unique";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "user_type";`);
    this.addSql(`alter table if exists "kyc_profile" drop column if exists "user_id";`);
  }

}
