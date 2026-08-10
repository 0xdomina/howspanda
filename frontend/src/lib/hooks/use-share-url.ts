"use client"

import { useParams } from "next/navigation"
import { getBaseURL } from "@lib/util/env"

/**
 * Builds absolute share URLs for the current country-code segment. Client-side
 * only, so it can live on any interactive screen without threading
 * `countryCode` down through props.
 */
export const useShareUrl = () => {
  const { countryCode } = useParams()
  const base = getBaseURL()

  return (path: string) => {
    const locale = typeof countryCode === "string" ? countryCode : "ng"
    const normalized = path.startsWith("/") ? path : `/${path}`
    return `${base}/${locale}${normalized}`
  }
}
