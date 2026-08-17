import { Migration } from "@mikro-orm/migrations"

export class Migration20260817120000AddProviderTransactionId extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "wallet_spend" add column if not exists "provider_transaction_id" text null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "wallet_spend" drop column if exists "provider_transaction_id";'
    )
  }
}
