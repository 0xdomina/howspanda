import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import AuthOtpModuleService, { normalizeEmail } from "../../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../../modules/auth-otp"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"

export const POST = async (
  req: AuthenticatedMedusaRequest<{ new_email: string; code: string }>,
  res: MedusaResponse
) => {
  const customerId = req.auth_context.actor_id as string
  const authIdentityId = req.auth_context.auth_identity_id as string
  const newEmail = normalizeEmail(req.validatedBody.new_email)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const customers = await query.graph({ entity: "customer", fields: ["id", "email"], filters: { id: [customerId] } })
  const customer = customers.data?.[0] as { id: string; email: string } | undefined
  if (!customer?.email) throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Customer account not found")

  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)
  await authOtp.verifyOtp({ email: newEmail, purpose: "email_change", code: req.validatedBody.code })

  const identityRows = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.id", "provider_identities.provider", "provider_identities.entity_id"],
    filters: { id: [authIdentityId] },
  })
  const identity = identityRows.data?.[0] as any
  const providerIdentity = (identity?.provider_identities ?? []).find((item: any) => item.provider === "emailpass")
  if (!providerIdentity) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Email login identity not found")

  const duplicate = await query.graph({
    entity: "auth_identity",
    fields: ["id"],
    filters: { provider_identities: { provider: "emailpass", entity_id: newEmail } },
  })
  if (duplicate.data?.some((item: any) => item.id !== authIdentityId)) {
    throw new MedusaError(MedusaError.Types.CONFLICT, "That email is already in use")
  }

  const auth = req.scope.resolve(Modules.AUTH)
  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const oldEmail = customer.email
  await auth.updateProviderIdentities({ id: providerIdentity.id, entity_id: newEmail })
  try {
    await customerModule.updateCustomers(customerId, { email: newEmail })

    const sellerAdmins = await query.graph({
      entity: "seller_admin",
      fields: ["id"],
      filters: { auth_identity_id: [authIdentityId] },
    })
    if (sellerAdmins.data?.length) {
      const marketplace = req.scope.resolve<any>(MARKETPLACE_MODULE)
      await marketplace.updateSellerAdmins(sellerAdmins.data.map((item: any) => item.id), { email: newEmail })
    }
  } catch (error) {
    await auth.updateProviderIdentities({ id: providerIdentity.id, entity_id: normalizeEmail(oldEmail) }).catch(() => {})
    throw error
  }

  res.json({ ok: true, email: newEmail })
}
