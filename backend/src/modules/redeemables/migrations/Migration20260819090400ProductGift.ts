import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260819090400ProductGift extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "redeemable" drop constraint if exists "redeemable_type_check";`)
    this.addSql(`alter table if exists "redeemable" add constraint "redeemable_type_check" check ("type" in ('gift_card', 'voucher', 'ticket', 'product_gift'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`update "redeemable" set "status" = 'cancelled' where "type" = 'product_gift';`)
    this.addSql(`alter table if exists "redeemable" drop constraint if exists "redeemable_type_check";`)
    this.addSql(`alter table if exists "redeemable" add constraint "redeemable_type_check" check ("type" in ('gift_card', 'voucher', 'ticket'));`)
  }
}
