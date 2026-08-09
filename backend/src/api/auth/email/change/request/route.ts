import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import AuthOtpModuleService, { normalizeEmail } from "../../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../../modules/auth-otp"
import { verifyCustomerPassword } from "../../../../../lib/auth/verify-customer-password"

export const POST = async (
  req: AuthenticatedMedusaRequest<{ new_email: string; current_password: string }>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context.actor_id as string
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const customers = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: [customerId] } })
  const customer = customers.data?.[0] as { id: string; email: string } | undefined
  if (!customer?.email) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account not found")

  const newEmail = normalizeEmail(req.validatedBody.new_email)
  if (newEmail === normalizeEmail(customer.email)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a different email address")
  }

  if (!(await verifyCustomerPassword(req.scope, customerId, req.validatedBody.current_password))) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Your current password is incorrect")
  }

  const existing = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.provider", "provider_identities.entity_id"],
    filters: { provider_identities: { provider: "emailpass", entity_id: newEmail } },
  })
  if (existing.data?.length) {
    throw new MedusaError(MedusaError.Types.CONFLICT, "That email is already in use")
  }

  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)
  const { code } = await authOtp.requestOtp({ email: newEmail, purpose: "email_change" })
  res.status(201).json({ ok: true, code })
}
