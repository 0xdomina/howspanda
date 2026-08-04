import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import PaymentRail from "./models/payment-rail"
import {
  defaultRailEnabled,
  isRailKey,
  RAILS,
  railMeta,
  railMode,
} from "../../lib/payments/rails"

export type RailStatus = {
  key: string
  providerId: string
  label: string
  kind: string
  enabled: boolean
  mode: string
}

class PaymentRailModuleService extends MedusaService({ PaymentRail }) {
  /**
   * Idempotently create rows for any rail not yet in the table, seeded from the
   * env defaults. After first boot the admin API is the source of truth.
   */
  private async seedDefaults(): Promise<void> {
    const existing = await this.listPaymentRails({}, { select: ["key"] })
    const present = new Set(existing.map((row) => row.key))
    const missing = RAILS.filter((rail) => !present.has(rail.key))
    if (missing.length) {
      await this.createPaymentRails(
        missing.map((rail) => ({
          key: rail.key,
          provider_id: rail.providerId,
          label: rail.label,
          kind: rail.kind,
          enabled: defaultRailEnabled(rail.key),
        }))
      )
    }
  }

  /**
   * Current rails with their runtime enabled flag and their env-derived mode.
   * Never exposes keys — only labels/kinds/flags.
   */
  async getStatus(): Promise<{ rails: RailStatus[] }> {
    await this.seedDefaults()
    const rows = await this.listPaymentRails(
      {},
      { order: { id: "ASC" } }
    )
    const rails = rows.map((row) => {
      const meta = railMeta(row.key)
      return {
        key: row.key,
        providerId: row.provider_id,
        label: row.label || meta?.label || row.key,
        kind: row.kind || meta?.kind || "manual",
        enabled: row.enabled,
        mode: isRailKey(row.key) ? railMode(row.key) : "mock",
      }
    })
    return { rails }
  }

  /**
   * Runtime toggle of a rail. Unknown keys are rejected so a typo can't
   * silently create a phantom row.
   */
  async setEnabled(key: string, enabled: boolean): Promise<{ rails: RailStatus[] }> {
    if (!isRailKey(key)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown payment rail "${key}"`
      )
    }
    const meta = railMeta(key)!
    const [existing] = await this.listPaymentRails({ key }, { take: 1 })
    if (existing) {
      await this.updatePaymentRails({ id: existing.id, enabled })
    } else {
      await this.createPaymentRails({
        key,
        provider_id: meta.providerId,
        label: meta.label,
        kind: meta.kind,
        enabled,
      })
    }
    return this.getStatus()
  }
}

export default PaymentRailModuleService
