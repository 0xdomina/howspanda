import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { signMediaPath } from "../../../lib/media/private-media"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const rawPath = Array.isArray(req.params.path)
    ? req.params.path.join("/")
    : req.params.path
  const signedUrl = await signMediaPath(rawPath || "")

  if (!signedUrl) {
    res.status(404).json({ message: "Media not found" })
    return
  }

  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
  res.redirect(302, signedUrl)
}
