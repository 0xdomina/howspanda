import { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"
import createSellerWorkflow from "../workflows/marketplace/create-seller"
import KycModuleService from "../modules/kyc/service"
import { KYC_MODULE } from "../modules/kyc"
import DeliveryModuleService from "../modules/delivery/service"
import { DELIVERY_MODULE } from "../modules/delivery"

const PASSWORD = process.env.SEED_TEST_PASSWORD ?? "HowsU2026!"

// The platform is progressive, not separate: a new signup is a buyer; the KYC
// ladder lifts the SAME account into seller (store) then courier features.
// These accounts cover each rung so every flow can be exercised end to end.
const COUNTRY = "Nigeria"
const STATE = "Lagos"
const CITY = "Ikeja"
const ADDRESS = "12 Test Street, Ikeja"

type Account =
  | {
      key: string
      email: string
      first_name: string
      last_name: string
      level: "buyer"
      phone: string
    }
  | {
      key: string
      email: string
      first_name: string
      last_name: string
      level: "seller"
      phone: string
      store: { name: string; handle: string }
    }
  | {
      key: string
      email: string
      first_name: string
      last_name: string
      level: "courier"
      phone: string
      courier: { name: string; city: string; vehicle: string }
    }

const ACCOUNTS: Account[] = [
  {
    key: "buyer",
    email: "amara.okeke@howsu.test",
    first_name: "Amara",
    last_name: "Okeke",
    level: "buyer",
    phone: "+2348031002001",
  },
  {
    key: "seller",
    email: "tunde.balogun@howsu.test",
    first_name: "Tunde",
    last_name: "Balogun",
    level: "seller",
    phone: "+2348031002002",
    store: { name: "Tunde Essentials", handle: "tunde-essentials" },
  },
  {
    key: "courier",
    email: "kemi.adeyemi@howsu.test",
    first_name: "Kemi",
    last_name: "Adeyemi",
    level: "courier",
    phone: "+2348031002003",
    courier: { name: "Kemi Adeyemi", city: "Ikeja", vehicle: "Motorcycle" },
  },
]

// Bring a KYC profile to a target level by setting the ladder fields
// directly (dev seed — no OTP/NIN provider round-trip needed).
async function liftKyc(
  kyc: KycModuleService,
  input: {
    email: string
    phone: string
    first_name: string
    last_name: string
    userType?: "customer" | "seller"
    userId?: string
    target: "profile_completed" | "identity_verified"
  }
) {
  const profile = await kyc.getOrCreateProfile({
    email: input.email,
    phone: input.phone,
    userType: input.userType,
    userId: input.userId,
  })
  await kyc.updateKycProfiles({
    id: profile.id,
    email_verified_at: new Date(),
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone,
    address: ADDRESS,
    country: COUNTRY,
    state: STATE,
    city: CITY,
    ...(input.target === "identity_verified"
      ? {
          id_type: "nin" as const,
          id_tail: "1234",
          id_status: "verified" as const,
          id_submitted_at: new Date(),
          id_reviewed_at: new Date(),
        }
      : {}),
  })
  const view = await kyc.getProfileView({
    email: input.email,
    phone: input.phone,
    userType: input.userType,
    userId: input.userId,
  })
  if (!view) {
    throw new Error(`KYC profile missing for ${input.email}`)
  }
  return view
}

export default async function seedTestAccounts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const auth = container.resolve<{ [key: string]: any }>(Modules.AUTH)
  const kyc: KycModuleService = container.resolve(KYC_MODULE)
  const delivery: DeliveryModuleService = container.resolve(DELIVERY_MODULE)

  const summary: { email: string; level: string; status: string }[] = []

  for (const acc of ACCOUNTS) {
    // 1. Authentication credential — the same identity the storefront uses.
    let authIdentityId: string | null = null
    const identities = await auth.listAuthIdentities(
      {},
      { relations: ["provider_identities"] }
    )
    const existing = identities.find((identity: any) =>
      identity.provider_identities?.some(
        (providerIdentity: any) =>
          providerIdentity.entity_id === acc.email &&
          providerIdentity.provider === "emailpass"
      )
    )
    if (existing) {
      // A fully registered account already owns this identity (actor attached)
      // — skip it so re-runs are safe.
      const meta = existing.app_metadata
      const actorAssigned =
        !!meta && typeof meta === "object" && Object.keys(meta).length > 0
      if (actorAssigned) {
        logger.info(`${acc.email} already seeded — skipping`)
        summary.push({ email: acc.email, level: acc.level, status: "skipped" })
        continue
      }
      authIdentityId = existing.id
      logger.info(`${acc.email} already has an identity — reusing it`)
    } else {
      const reg = await auth.register("emailpass", {
        body: { email: acc.email, password: PASSWORD },
      })
      if (!reg.success) {
        throw new Error(
          `Could not register ${acc.email}: ${reg.error ?? "unknown error"}`
        )
      }
      authIdentityId = reg.authIdentity?.id ?? null
      if (!authIdentityId) {
        throw new Error(`Registering ${acc.email} returned no identity id`)
      }
      logger.info(`Created auth identity for ${acc.email}`)
    }
    if (!authIdentityId) {
      throw new Error(`No auth identity for ${acc.email}`)
    }

    if (acc.level === "buyer") {
      // Buyer level: a plain customer. The KYC ladder stays untouched so the
      // buyer UI shows "unverified" and every gated feature is still closed.
      await createCustomerAccountWorkflow(container).run({
        input: {
          authIdentityId,
          customerData: {
            email: acc.email,
            first_name: acc.first_name,
            last_name: acc.last_name,
          },
        },
      })
      summary.push({ email: acc.email, level: "buyer", status: "created" })
      continue
    }

    if (acc.level === "seller") {
      // Seller level: a store is created for this account. Callers can act on
      // seller routes either as a seller-actor or (via auth_identity) customer.
      const { result } = await createSellerWorkflow(container).run({
        input: {
          name: acc.store!.name,
          handle: acc.store!.handle,
          admin: {
            email: acc.email,
            first_name: acc.first_name,
            last_name: acc.last_name,
          },
          authIdentityId,
          preserveCustomerAuth: false,
        },
      })
      const sellerAdminId: string | undefined = result.seller.admins?.[0]?.id
      await liftKyc(kyc, {
        email: acc.email,
        phone: acc.phone,
        first_name: acc.first_name,
        last_name: acc.last_name,
        userType: "seller",
        userId: sellerAdminId,
        target: "profile_completed",
      })
      summary.push({ email: acc.email, level: "seller", status: "created" })
      continue
    }

    // Courier level: customer account, identity-verified KYC, courier profile.
    const { result: customer } = await createCustomerAccountWorkflow(
      container
    ).run({
      input: {
        authIdentityId,
        customerData: {
          email: acc.email,
          first_name: acc.first_name,
          last_name: acc.last_name,
        },
      },
    })
    await liftKyc(kyc, {
      email: acc.email,
      phone: acc.phone,
      first_name: acc.first_name,
      last_name: acc.last_name,
      userType: "customer",
      userId: customer.id,
      target: "identity_verified",
    })
    await delivery.applyCourier({
      courierEmail: acc.email,
      authIdentityId,
      actorType: "customer",
      name: acc.courier!.name,
      phone: acc.phone,
      city: acc.courier!.city,
      vehicle: acc.courier!.vehicle,
    })
    summary.push({ email: acc.email, level: "courier", status: "created" })
  }

  logger.info("")
  logger.info("Seed test accounts ready:")
  for (const row of summary) {
    logger.info(`  • ${row.email}  (${row.level})  password: ${PASSWORD}`)
  }
  logger.info("")
  logger.info(
    "Same account = progressive levels (buyer → seller → courier). No separate accounts."
  )
}
