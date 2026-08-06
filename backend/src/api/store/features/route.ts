import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { featureFlags } from "../../../lib/features/flags"

// Public, secret-free feature toggles. The frontend polls this so UI (the NIN
// verification step, the product video upload) appears instantly when a flag
// is flipped on the server — no deploy or app update needed.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ features: featureFlags() })
}
