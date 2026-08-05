import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260806110000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`CREATE SEQUENCE IF NOT EXISTS "wallet_derivation_index_seq";`);
    // Seed the counter above every index already stored (previously hash-derived)
    // so newly allocated sequential indices can never collide with legacy rows.
    this.addSql(`SELECT setval('wallet_derivation_index_seq', GREATEST(COALESCE((SELECT MAX(derivation_index) FROM "user_wallet"), 0), 1), true);`);
    // Unique by construction from here on: the counter guarantees two actors can
    // never be derived onto the same key/address.
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_wallet_derivation_index_unique" ON "user_wallet" ("derivation_index") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS "IDX_user_wallet_derivation_index_unique";`);
    this.addSql(`DROP SEQUENCE IF EXISTS "wallet_derivation_index_seq";`);
  }

}
