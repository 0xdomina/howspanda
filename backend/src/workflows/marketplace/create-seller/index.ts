import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk"
import {
  setAuthAppMetadataStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import createSellerAdminStep from "./steps/create-seller-admin"
import createSellerStep from "./steps/create-seller"
import seedSellerKycStep from "./steps/seed-seller-kyc"

export type CreateSellerWorkflowInput = {
  name: string
  handle?: string
  logo?: string
  description?: string
  admin: {
    email?: string
    phone?: string
    first_name?: string
    last_name?: string
  }
  authIdentityId: string
}

const createSellerWorkflow = createWorkflow(
  "create-seller",
  function (input: CreateSellerWorkflowInput) {
    const sellerInput = transform({ input }, ({ input }) => {
      // The store link is optional — derive a handle from the store name so a
      // seller never has to think about slugs.
      const rawName = (input.name || "").trim()
      const baseHandle = input.handle
        ? input.handle.trim().toLowerCase()
        : rawName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || `store-${Date.now().toString(36)}`
      return {
        name: input.name,
        handle: baseHandle,
        logo: input.logo,
        description: input.description,
      }
    })

    const seller = createSellerStep(sellerInput)

    const sellerAdminData = transform({
      input,
      seller,
    }, (data) => {
      return {
        ...data.input.admin,
        seller_id: data.seller.id,
      }
    })

    const sellerAdmin = createSellerAdminStep(sellerAdminData)

    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: "seller",
      value: sellerAdmin.id,
    })

    // The signup identifier (email or phone) is the seller's verified contact
    // — the login credential proves ownership — so KYC seeds it as verified
    // immediately. KYC then only covers the complementary identifier + identity.
    seedSellerKycStep({
      email: input.admin.email,
      phone: input.admin.phone,
    })

    // @ts-ignore
    const { data: sellerWithAdmin } = useQueryGraphStep({
      entity: "seller",
      fields: ["id", "name", "handle", "logo", "description",
        "verification_status", "commission_rate", "admins.*"],
      filters: {
        id: seller.id,
      },
    })

    return new WorkflowResponse({
      seller: sellerWithAdmin[0],
    })
  }
)

export default createSellerWorkflow
