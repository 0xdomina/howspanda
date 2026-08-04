import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260806100000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "user_wallet" ("id" text not null, "actor_type" text not null, "actor_id" text not null, "wallet_key" text not null, "network" text not null default 'arc', "env" text not null default 'testnet', "address" text not null, "derivation_index" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "user_wallet_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_wallet_actor_network_unique" ON "user_wallet" ("actor_type", "actor_id", "network") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_user_wallet_deleted_at" ON "user_wallet" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "wallet_spend" ("id" text not null, "idempotency_key" text not null, "to_address" text not null, "usdc_amount" text not null, "reference" text not null, "status" text not null default 'pending', "tx_hash" text null, "wallet_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "wallet_spend_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wallet_spend_idempotency_unique" ON "wallet_spend" ("idempotency_key", "wallet_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wallet_spend_wallet_id" ON "wallet_spend" ("wallet_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_wallet_spend_deleted_at" ON "wallet_spend" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wallet_spend" cascade;`);
    this.addSql(`drop table if exists "user_wallet" cascade;`);
  }

}
