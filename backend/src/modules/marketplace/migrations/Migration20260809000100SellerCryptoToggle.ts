import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260809000100SellerCryptoToggle extends Migration {

  override async up(): Promise<void> {
    // Per-seller crypto payment switch. Existing sellers keep crypto enabled
    // (the default), so nothing changes until an owner flips it off.
    this.addSql(`alter table if exists "seller" add column if not exists "crypto_payments_enabled" boolean not null default true;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller" drop column if exists "crypto_payments_enabled";`);
  }

}
