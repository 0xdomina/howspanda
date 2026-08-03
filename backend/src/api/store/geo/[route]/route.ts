import { MedusaError } from "@medusajs/framework/utils"
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { geocodeAddress, reverseGeocode } from "../../../../lib/geo/geocode"

// Public location helpers (publishable key).
//   GET /store/geo/geocode?address=...            → { result } | { error }
//   GET /store/geo/reverse?lat=..&lng=..          → { result } | { error }
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const route = (req.params?.route ?? "") as string

  if (route === "geocode") {
    const address = String(req.query?.address ?? "")
    if (!address.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "address query param is required"
      )
    }
    const result = await geocodeAddress(address)
    if (!result) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Address could not be located"
      )
    }
    return res.json({ result })
  }

  if (route === "reverse") {
    const lat = Number(req.query?.lat)
    const lng = Number(req.query?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "lat and lng query params are required"
      )
    }
    const result = await reverseGeocode(lat, lng)
    if (!result) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Location could not be reversed"
      )
    }
    return res.json({ result })
  }

  throw new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "Unknown geo route. Use /store/geo/geocode or /store/geo/reverse"
  )
}
