import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { AI_MODULE } from "../../../../../modules/ai"
import AiModuleService from "../../../../../modules/ai/service"
import { resolveChatActor } from "../../../../../lib/ai/chat-actor"

// The actor's conversation list (id, title, updated_at), newest first.
// Owner-scoped via the resolved identity (auth actor or guest client_key).
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const aiService: AiModuleService = req.scope.resolve(AI_MODULE)
  const actor = resolveChatActor(req, { query: req.query as any })

  const conversations = await aiService.listConversations(actor)

  res.json({ ok: true, conversations })
}
