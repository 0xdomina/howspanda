import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"

import AuthOtpModuleService from "../../../../modules/auth-otp/service"
import { AUTH_OTP_MODULE } from "../../../../modules/auth-otp"
import { PostAuthOtpSignupSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAuthOtpSignupSchema>

// Verify the signup OTP and create the customer in one backend-owned request.
// Keeping these steps together avoids passing a short-lived proof through a
// separate storefront server action, while the OTP remains single-use and the
// email/password identity is still created by Medusa's auth provider.
export const POST = async (
  req: MedusaRequest<Body>,
  res: MedusaResponse
) => {
  const body = req.validatedBody
  const email = body.email.trim().toLowerCase()
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const existing = await query.graph({
    entity: "auth_identity",
    fields: ["id", "provider_identities.provider", "provider_identities.entity_id"],
    filters: {
      provider_identities: {
        provider: "emailpass",
        entity_id: email,
      },
    },
  })

  if (existing.data?.length) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "An account with this email already exists. Sign in instead."
    )
  }

  const authOtp = req.scope.resolve<AuthOtpModuleService>(AUTH_OTP_MODULE)
  await authOtp.verifyOtp({
    email,
    purpose: "signup",
    code: body.code,
  })

  const auth = req.scope.resolve<any>(Modules.AUTH)
  const registration = await auth.register("emailpass", {
    url: req.url,
    headers: req.headers,
    query: req.query,
    protocol: req.protocol,
    body: { email, password: body.password },
  })

  if (!registration.success || !registration.authIdentity?.id) {
    if (/already|exist|duplicate|forbidden/i.test(registration.error ?? "")) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "An account with this email already exists. Sign in instead."
      )
    }
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      registration.error ?? "We could not create your account."
    )
  }

  const { result: customer } = await createCustomerAccountWorkflow(
    req.scope
  ).run({
    input: {
      authIdentityId: registration.authIdentity.id,
      customerData: {
        email,
        ...(body.first_name ? { first_name: body.first_name } : {}),
        ...(body.last_name ? { last_name: body.last_name } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
      },
    },
  })

  res.status(201).json({ ok: true, customer })
}
