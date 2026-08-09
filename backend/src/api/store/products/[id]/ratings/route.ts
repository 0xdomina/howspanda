import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const reviews = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const aggregate = await reviews.getProductRatingAggregate(req.params.id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const buyerEmails = [...new Set(
    aggregate.reviews.map((review) => review.buyer_email).filter(Boolean)
  )]
  const names: Record<string, string> = {}
  if (buyerEmails.length) {
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["email", "first_name", "last_name"],
      filters: { email: buyerEmails },
    })
    for (const customer of customers ?? []) {
      if (!customer.email) continue
      const name = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .map((part: string) => part.trim())
        .join(" ")
        .trim()
      if (name) names[customer.email.trim().toLowerCase()] = name
    }
  }

  res.json({
    average: aggregate.average,
    count: aggregate.count,
    reviews: aggregate.reviews.map(({ buyer_email, ...review }) => ({
      ...review,
      name: names[buyer_email.trim().toLowerCase()] ?? "Verified buyer",
    })),
  })
}
