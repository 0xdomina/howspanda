import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import PlatformFeature from "./models/platform-feature"
import {
  defaultFeatureEnabled,
  FEATURE_DEFINITIONS,
  featureDefinition,
  type PlatformFeatureKey,
} from "../../lib/features/flags"

export type PlatformFeatureStatus = {
  key: PlatformFeatureKey
  label: string
  description: string
  enabled: boolean
  default_enabled: boolean
  source: "runtime"
}

class PlatformFeatureModuleService extends MedusaService({ PlatformFeature }) {
  private async seedDefaults(): Promise<void> {
    const existing = await this.listPlatformFeatures({}, { select: ["key"] })
    const present = new Set(existing.map((row) => row.key))
    const missing = FEATURE_DEFINITIONS.filter(
      (definition) => !present.has(definition.key)
    )

    if (missing.length) {
      await this.createPlatformFeatures(
        missing.map((definition) => ({
          key: definition.key,
          label: definition.label,
          description: definition.description,
          enabled: defaultFeatureEnabled(definition.key),
        }))
      )
    }
  }

  async getStatus(): Promise<{ features: PlatformFeatureStatus[] }> {
    await this.seedDefaults()
    const rows = await this.listPlatformFeatures({}, { order: { key: "ASC" } })

    return {
      features: rows.flatMap((row) => {
        const definition = featureDefinition(row.key)
        if (!definition) return []
        return [{
          key: definition.key,
          label: definition.label,
          description: definition.description,
          enabled: row.enabled,
          default_enabled: defaultFeatureEnabled(definition.key),
          source: "runtime" as const,
        }]
      }),
    }
  }

  async isEnabled(key: PlatformFeatureKey): Promise<boolean> {
    await this.seedDefaults()
    const definition = featureDefinition(key)
    if (!definition) return false
    const [row] = await this.listPlatformFeatures({ key }, { take: 1 })
    return row?.enabled ?? defaultFeatureEnabled(key)
  }

  async setEnabled(
    key: string,
    enabled: boolean
  ): Promise<{ features: PlatformFeatureStatus[] }> {
    const definition = featureDefinition(key)
    if (!definition) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown platform feature "${key}"`
      )
    }

    await this.seedDefaults()
    const [existing] = await this.listPlatformFeatures({ key }, { take: 1 })
    if (existing) {
      await this.updatePlatformFeatures({ id: existing.id, enabled })
    } else {
      await this.createPlatformFeatures({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        enabled,
      })
    }

    return this.getStatus()
  }

  async getPublicFlags(): Promise<
    Partial<Record<PlatformFeatureKey, boolean>> & { product_video: true }
  > {
    const { features } = await this.getStatus()
    const flags = {} as Partial<Record<PlatformFeatureKey, boolean>>
    for (const feature of features) {
      const definition = featureDefinition(feature.key)
      // Disabled controls are omitted entirely so the public API does not
      // advertise a feature that is not currently part of the product.
      if (definition?.public && feature.enabled) flags[feature.key] = true
    }
    return { ...flags, product_video: true }
  }
}

export default PlatformFeatureModuleService
