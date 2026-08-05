import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Status index for the wallet-spend reconcile sweep: the scheduled job lists
// every `signed` row every few minutes, so the filter must not scan the table.
export class Migration20260806120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wallet_spend_status" ON "wallet_spend" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_wallet_spend_status";`);
  }

}
