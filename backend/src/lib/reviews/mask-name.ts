// Privacy-preserving display name from the order email, at read time. Raw
// emails never leave seller/admin surfaces.
//   "chidi.okafor@gmail.com" → "Chi… O."   "bob@x.com" → "Bob"
export function maskName(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[._+-]+/g, " ").trim()
  if (!local) return "Anonymous"
  const cap = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  const parts = local.split(/\s+/).filter(Boolean)
  const first =
    parts[0].length > 3 ? `${cap(parts[0].slice(0, 3))}…` : cap(parts[0])
  if (parts.length > 1 && parts[1]) {
    return `${first} ${parts[1][0].toUpperCase()}.`
  }
  return first
}
