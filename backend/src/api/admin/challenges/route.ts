import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { GROWTH_MODULE } from "../../../modules/growth"
import GrowthModuleService from "../../../modules/growth/service"
import { PostChallengeCreateSchema } from "../../middlewares"

type PostBody = z.infer<typeof PostChallengeCreateSchema>

// Admin challenge management. Creating always starts a challenge in `draft`;
// flipping to `live` (or setting ends_at) is the on/off + time-expiry control.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const challenges = await growth.listChallenges(
    {},
    { order: { created_at: "DESC" } }
  )
  res.json({ challenges })
}

export const POST = async (req: MedusaRequest<PostBody>, res: MedusaResponse) => {
  const growth = req.scope.resolve<GrowthModuleService>(GROWTH_MODULE)
  const body = req.validatedBody

  const [existing] = await growth.listChallenges({ slug: body.slug })
  if (existing) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "A challenge with this slug already exists"
    )
  }

  const [challenge] = await growth.createChallenges([
    {
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      type: body.type,
      audience: body.audience,
      status: "draft" as const,
      starts_at: body.starts_at ?? null,
      ends_at: body.ends_at ?? null,
      config: body.config ?? {},
    },
  ])
  res.status(201).json({ challenge })
}
