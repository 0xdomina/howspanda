// Simple, provider-free NIN match. When a real NIMC provider (Dojah, idtra,
// VerifyMe, idbase) is wired up later, this seam is where that API call lands
// and the same { verified, reason } shape comes back. Until then the "match"
// is an internal consistency check: the ID document's number must be a valid
// 11-digit NIN and the name read off the card must agree with the name on the
// user's KYC profile — that is what makes client-side extraction trustworthy.

export type ExtractedNinDoc = {
  id_number?: string | null
  first_name?: string | null
  last_name?: string | null
  other_name?: string | null
  date_of_birth?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  address?: string | null
}

const NIN_RE = /^\d{11}$/

/** Lowercase, strip diacritics, collapse non-alphanumerics to single spaces. */
export function normalizeName(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const A = new Set(a.split(/\s+/).filter(Boolean))
  const B = new Set(b.split(/\s+/).filter(Boolean))
  if (A.size === 0 || B.size === 0) return 0
  let hits = 0
  A.forEach((t) => {
    if (B.has(t)) hits += 1
  })
  return hits / Math.max(A.size, B.size)
}

export function matchNin(input: {
  profile: {
    first_name?: string | null
    last_name?: string | null
    other_name?: string | null
  }
  doc: ExtractedNinDoc
}): { verified: boolean; reason?: string } {
  const nin = (input.doc.id_number ?? "").trim()
  if (!NIN_RE.test(nin)) {
    return {
      verified: false,
      reason:
        "The extracted NIN is not an 11-digit number. Retake the ID card photo and try again.",
    }
  }

  const profileName = normalizeName(
    `${input.profile.first_name ?? ""} ${input.profile.last_name ?? ""}`
  )
  const docName = normalizeName(
    `${input.doc.first_name ?? ""} ${input.doc.last_name ?? ""}`
  )

  if (!profileName || !docName) {
    return {
      verified: false,
      reason:
        "We couldn't read a name from the ID card. Complete your profile first, then retake the photo or enter the details manually.",
    }
  }

  const same =
    profileName === docName ||
    profileName.includes(docName) ||
    docName.includes(profileName) ||
    tokenOverlap(profileName, docName) >= 0.6

  if (!same) {
    return {
      verified: false,
      reason: "The name on the ID card doesn't match the name on your profile.",
    }
  }

  return { verified: true }
}
