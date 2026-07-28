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

export type CreateSellerWorkflowInput = {
  name: string
  handle?: string
  logo?: string
  description?: string
  admin: {
    email: string
    first_name?: string
    last_name?: string
  }
  authIdentityId: string
}

const createSellerWorkflow = createWorkflow(
  "create-seller",
  function (input: CreateSellerWorkflowInput) {
    const seller = createSellerStep({
      name: input.name,
      handle: input.handle,
      logo: input.logo,
      description: input.description,
    })

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
