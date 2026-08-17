import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * A completed order may have exactly one live direct-transfer proof per
 * seller. The application check is useful for normal requests, but cannot
 * prevent two retries from creating rows at the same time.
 *
 * The preflight intentionally fails with a clear message if old data already
 * contains duplicates. That keeps a production migration safe: operators must
 * reconcile those payment records before enabling the invariant instead of
 * silently deleting evidence.
 */
export class Migration20260817090000PaymentProofUniqueness extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "payment_proof"
          WHERE "deleted_at" IS NULL
          GROUP BY "order_id", "seller_id"
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'payment_proof contains duplicate live order/seller rows; reconcile before applying uniqueness guard';
        END IF;
      END $$;
    `)
    this.addSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payment_proof_order_seller_live"
      ON "payment_proof" ("order_id", "seller_id")
      WHERE "deleted_at" IS NULL;
    `)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_payment_proof_order_seller_live";`)
  }
}
