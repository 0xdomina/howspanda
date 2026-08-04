import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { PAYMENT_RAILS_MODULE } from "../../../modules/payment-rails"
import PaymentRailModuleService from "../../../modules/payment-rails/service"

// Admin view of every payment rail: enabled flag + env-derived mode.
export const GET = async (
  _req: MedusaRequest,
  res: MedusaResponse
) => {
  const rails: PaymentRailModuleService = _req.scope.resolve(PAYMENT_RAILS_MODULE)
  res.json(await rails.getStatus())
}

// Runtime toggle of a rail's on/off state (persisted). Switching a rail's
// mock/test/live MODE is a provider-key change in env + restart — the admin
// surface reports the resulting mode but cannot hot-swap provider keys.
export const PATCH = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { key } = req.params as { key: string }
  const { enabled } = req.validatedBody as { enabled: boolean }
  const rails: PaymentRailModuleService = req.scope.resolve(PAYMENT_RAILS_MODULE)
  res.json(await rails.setEnabled(key, enabled))
}
