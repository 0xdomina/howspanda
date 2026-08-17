import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260817122000WalletCreditIdempotency extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create unique index if not exists "IDX_buyer_wallet_ledger_credit_reference_unique" on "buyer_wallet_ledger" ("wallet_id", "source", "reference") where deleted_at is null and reference is not null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_buyer_wallet_ledger_credit_reference_unique";`)
  }
}
