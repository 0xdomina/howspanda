// Feature definitions are the allowlist for the runtime operations control.
// Environment variables provide first-boot and emergency defaults; once a row
// exists in the database, the persisted setting becomes the source of truth.
export type PlatformFeatureKey = "malls" | "nin_verification"

export type FeatureDefinition = {
  key: PlatformFeatureKey
  label: string
  description: string
  envKey: string
  defaultEnabled: boolean
  public: boolean
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: "malls",
    label: "Malls",
    description: "Timed collaborative shopping malls and their prize pools.",
    envKey: "FEATURE_MALLS",
    defaultEnabled: true,
    public: true,
  },
  {
    key: "nin_verification",
    label: "Identity verification",
    description: "ID verification and the courier KYC unlock.",
    envKey: "FEATURE_NIN_VERIFICATION",
    defaultEnabled: true,
    public: true,
  },
]

const DEFINITION_BY_KEY = new Map(
  FEATURE_DEFINITIONS.map((definition) => [definition.key, definition])
)

export function featureDefinition(key: string): FeatureDefinition | undefined {
  return DEFINITION_BY_KEY.get(key as PlatformFeatureKey)
}

export function defaultFeatureEnabled(key: PlatformFeatureKey): boolean {
  const definition = DEFINITION_BY_KEY.get(key)
  if (!definition) return false
  const value = process.env[definition.envKey]
  return value == null
    ? definition.defaultEnabled
    : value.toLowerCase() !== "false"
}

export type FeatureFlags = {
  malls: boolean
  nin_verification: boolean
  product_video: boolean
}

export function featureFlags(): FeatureFlags {
  return {
    malls: defaultFeatureEnabled("malls"),
    nin_verification: defaultFeatureEnabled("nin_verification"),
    // Product media is a core marketplace capability, not an operations
    // switch. Keep the field for storefront compatibility.
    product_video: true,
  }
}

export function featureEnabled(name: keyof FeatureFlags): boolean {
  return featureFlags()[name]
}
