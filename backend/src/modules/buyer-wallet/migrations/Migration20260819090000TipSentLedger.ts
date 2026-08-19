import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260819090000TipSentLedger extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "buyer_wallet_ledger" drop constraint if exists "buyer_wallet_ledger_source_check";`)
    this.addSql(`alter table if exists "buyer_wallet_ledger" add constraint "buyer_wallet_ledger_source_check" check ("source" in ('campaign', 'tip_credit', 'tip_sent', 'referral', 'withdrawal', 'adjustment', 'mall_prize', 'delivery_payout'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`update "buyer_wallet_ledger" set "source" = 'adjustment' where "source" = 'tip_sent';`)
    this.addSql(`alter table if exists "buyer_wallet_ledger" drop constraint if exists "buyer_wallet_ledger_source_check";`)
    this.addSql(`alter table if exists "buyer_wallet_ledger" add constraint "buyer_wallet_ledger_source_check" check ("source" in ('campaign', 'tip_credit', 'referral', 'withdrawal', 'adjustment', 'mall_prize', 'delivery_payout'));`)
  }
}
