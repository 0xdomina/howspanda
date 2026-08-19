import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260819090100NotificationKinds extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "app_notification" drop constraint if exists "app_notification_kind_check";`)
    this.addSql(`alter table if exists "app_notification" add constraint "app_notification_kind_check" check ("kind" in ('store_broadcast', 'giveaway_claimed', 'tip_received', 'product_request_update'));`)
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "app_notification" where "kind" in ('tip_received', 'product_request_update');`)
    this.addSql(`alter table if exists "app_notification" drop constraint if exists "app_notification_kind_check";`)
    this.addSql(`alter table if exists "app_notification" add constraint "app_notification_kind_check" check ("kind" in ('store_broadcast', 'giveaway_claimed'));`)
  }
}
