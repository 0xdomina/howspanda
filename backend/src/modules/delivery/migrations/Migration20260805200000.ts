import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260805200000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "delivery_courier" ("id" text not null, "courier_email" text not null, "auth_identity_id" text null, "actor_type" text check ("actor_type" in ('customer', 'seller')) null, "name" text null, "phone" text null, "city" text null, "vehicle" text null, "status" text check ("status" in ('applied', 'approved', 'suspended')) not null default 'applied', "approved_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_courier_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_courier_email_unique" ON "delivery_courier" ("courier_email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_courier_deleted_at" ON "delivery_courier" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_courier" cascade;`);
  }

}
