import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { runAiRoute } from "../../../../lib/ai/run-ai-route"
import { generateListing } from "../../../../lib/ai/capabilities"
import { PostAiListingSchema } from "../../../middlewares"

type Body = z.infer<typeof PostAiListingSchema>

export const POST = async (
  req: AuthenticatedMedusaRequest<Body>,
  res: MedusaResponse
) => {
  await runAiRoute(req, res, "listing", async () => {
    return await generateListing({
      notes: req.validatedBody.notes,
      category: req.validatedBody.category,
    })
  })
}
