import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260803120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "delivery_job" add column if not exists "pickup_lat" double precision null;`);
    this.addSql(`alter table if exists "delivery_job" add column if not exists "pickup_lng" double precision null;`);
    this.addSql(`alter table if exists "delivery_job" add column if not exists "destination_lat" double precision null;`);
    this.addSql(`alter table if exists "delivery_job" add column if not exists "destination_lng" double precision null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "delivery_job" drop column if exists "pickup_lat";`);
    this.addSql(`alter table if exists "delivery_job" drop column if exists "pickup_lng";`);
    this.addSql(`alter table if exists "delivery_job" drop column if exists "destination_lat";`);
    this.addSql(`alter table if exists "delivery_job" drop column if exists "destination_lng";`);
  }

}
