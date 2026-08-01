import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260801090154 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "buyer_wallet" drop constraint if exists "buyer_wallet_buyer_email_unique";`);
    this.addSql(`create table if not exists "buyer_wallet" ("id" text not null, "buyer_email" text not null, "currency_code" text not null default 'ngn', "balance" numeric not null default 0, "raw_balance" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "buyer_wallet_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_buyer_wallet_buyer_email_unique" ON "buyer_wallet" ("buyer_email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_wallet_deleted_at" ON "buyer_wallet" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "buyer_wallet_ledger" ("id" text not null, "wallet_id" text not null, "amount" numeric not null, "source" text check ("source" in ('campaign', 'tip_credit', 'referral', 'withdrawal', 'adjustment')) not null, "reference" text null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "buyer_wallet_ledger_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_wallet_ledger_wallet_id" ON "buyer_wallet_ledger" ("wallet_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_buyer_wallet_ledger_deleted_at" ON "buyer_wallet_ledger" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "buyer_wallet_ledger" add constraint "buyer_wallet_ledger_wallet_id_foreign" foreign key ("wallet_id") references "buyer_wallet" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "buyer_wallet_ledger" drop constraint if exists "buyer_wallet_ledger_wallet_id_foreign";`);

    this.addSql(`drop table if exists "buyer_wallet" cascade;`);

    this.addSql(`drop table if exists "buyer_wallet_ledger" cascade;`);
  }

}
