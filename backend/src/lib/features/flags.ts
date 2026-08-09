// Runtime feature toggles, backed by env vars so they can be flipped without a
// code change. The frontend reads the same values via GET /store/features and
// shows/hides UI instantly when a flag is turned on.
export type FeatureFlags = {
  // NIN document verification. Enabled unless explicitly disabled so a
  // verified ID can unlock courier features in production.
  nin_verification: boolean
  // Product showcase video upload. Off by default. When flipped on, sellers
  // can attach a single compressed 30s video to a product.
  product_video: boolean
}

export function featureFlags(): FeatureFlags {
  return {
    nin_verification: process.env.FEATURE_NIN_VERIFICATION !== "false",
    product_video: process.env.FEATURE_PRODUCT_VIDEO === "true",
  }
}

export function featureEnabled(name: keyof FeatureFlags): boolean {
  return featureFlags()[name]
}
