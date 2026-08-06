// Resolve a person's display name from their profile. Returns the proper name
// (first + last) when available and null otherwise — it NEVER derives a name
// from an email, so no part of a user's email can leak into the UI as their
// name. Callers fall back to a neutral label ("there", "Courier", …) instead.
export function getDisplayName(
  person: {
    first_name?: string | null
    last_name?: string | null
  } | null | undefined
): string | null {
  if (!person) return null
  const parts = [person.first_name, person.last_name]
    .filter(Boolean)
    .map((p) => (p as string).trim())
    .filter(Boolean)
  return parts.length ? parts.join(" ") : null
}
