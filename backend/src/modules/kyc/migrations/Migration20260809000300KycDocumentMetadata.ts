import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260809000300KycDocumentMetadata extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "kyc_profile" add column if not exists "id_document_hash" text null;`
    )
    this.addSql(
      `alter table if exists "kyc_profile" add column if not exists "id_document_mime" text null;`
    )
    this.addSql(
      `alter table if exists "kyc_profile" add column if not exists "id_document_size" numeric null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "kyc_profile" drop column if exists "id_document_hash";`
    )
    this.addSql(
      `alter table if exists "kyc_profile" drop column if exists "id_document_mime";`
    )
    this.addSql(
      `alter table if exists "kyc_profile" drop column if exists "id_document_size";`
    )
  }
}
