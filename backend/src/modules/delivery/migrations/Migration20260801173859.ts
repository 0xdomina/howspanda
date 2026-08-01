import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801173859 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "delivery_job" ("id" text not null, "order_id" text null, "seller_id" text null, "package_description" text not null, "package_weight" text null, "pickup_address" text not null, "destination_address" text not null, "destination_phone" text null, "posted_price" numeric not null, "status" text check ("status" in ('open', 'negotiating', 'accepted', 'in_transit', 'delivered', 'cancelled')) not null default 'open', "accepted_offer_id" text null, "picked_up_at" timestamptz null, "delivered_at" timestamptz null, "cancelled_at" timestamptz null, "cancel_reason" text null, "cancel_requires_sender_approval" boolean not null default false, "raw_posted_price" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_job_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_job_deleted_at" ON "delivery_job" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery_message" ("id" text not null, "job_id" text not null, "sender_email" text not null, "body" text not null, "is_system" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_message_job_id" ON "delivery_message" ("job_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_message_deleted_at" ON "delivery_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery_offer" ("id" text not null, "job_id" text not null, "courier_email" text not null, "offered_price" numeric not null, "status" text check ("status" in ('pending', 'accepted', 'rejected', 'withdrawn')) not null default 'pending', "raw_offered_price" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_offer_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_offer_job_id" ON "delivery_offer" ("job_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_offer_deleted_at" ON "delivery_offer" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery_party" ("id" text not null, "job_id" text not null, "role" text check ("role" in ('sender', 'courier', 'recipient')) not null, "email" text not null, "seller_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_party_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_party_job_id" ON "delivery_party" ("job_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_party_deleted_at" ON "delivery_party" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery_verification" ("id" text not null, "job_id" text not null, "purpose" text check ("purpose" in ('pickup', 'delivery')) not null, "code_hash" text not null, "code_tail" text not null, "status" text check ("status" in ('active', 'used', 'expired')) not null default 'active', "generated_by_email" text not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_verification_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_verification_job_id" ON "delivery_verification" ("job_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_verification_deleted_at" ON "delivery_verification" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "delivery_message" add constraint "delivery_message_job_id_foreign" foreign key ("job_id") references "delivery_job" ("id") on update cascade;`);

    this.addSql(`alter table if exists "delivery_offer" add constraint "delivery_offer_job_id_foreign" foreign key ("job_id") references "delivery_job" ("id") on update cascade;`);

    this.addSql(`alter table if exists "delivery_party" add constraint "delivery_party_job_id_foreign" foreign key ("job_id") references "delivery_job" ("id") on update cascade;`);

    this.addSql(`alter table if exists "delivery_verification" add constraint "delivery_verification_job_id_foreign" foreign key ("job_id") references "delivery_job" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "delivery_message" drop constraint if exists "delivery_message_job_id_foreign";`);

    this.addSql(`alter table if exists "delivery_offer" drop constraint if exists "delivery_offer_job_id_foreign";`);

    this.addSql(`alter table if exists "delivery_party" drop constraint if exists "delivery_party_job_id_foreign";`);

    this.addSql(`alter table if exists "delivery_verification" drop constraint if exists "delivery_verification_job_id_foreign";`);

    this.addSql(`drop table if exists "delivery_job" cascade;`);

    this.addSql(`drop table if exists "delivery_message" cascade;`);

    this.addSql(`drop table if exists "delivery_offer" cascade;`);

    this.addSql(`drop table if exists "delivery_party" cascade;`);

    this.addSql(`drop table if exists "delivery_verification" cascade;`);
  }

}
