// Privacy hard-line for in-app broadcasts: the platform is the ONLY channel
// between buyers and sellers. Broadcast copy must never carry contact info —
// if a store owner tries to hand out an email or phone number it is rejected
// (so followers can't be pulled off-platform).

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
// Loose phone pattern: +country / 0 / 234 prefixes, 10-15 digits with
// optional spaces/dashes/parens. Looseness beats precision — a false positive
// is a rejected broadcast, which is cheap and honest.
const PHONE_RE = /(?:\+?\d{1,3}[\s\-]?)?(?:0\d{10}|234\d{10}|[7-9]\d{9}|\d{3}[\s\-]?\d{3}[\s\-]?\d{4})\b/

export type ContactLeak = { kind: "email" | "phone"; match: string }

/**
 * Returns the first contact detail found in `text`, or null when clean.
 * Used to reject broadcast copy before fan-out.
 */
export function findContactLeak(text: string): ContactLeak | null {
  const email = text.match(EMAIL_RE)
  if (email) return { kind: "email", match: email[0] }

  // Strip emails first so the digits of an address aren't read as a phone.
  const withoutEmails = text.replace(EMAIL_RE, " ")
  const phone = withoutEmails.match(PHONE_RE)
  if (phone) return { kind: "phone", match: phone[0] }

  return null
}

/** Overwrite contact-shaped strings so stored copy can never be scraped. */
export function redactContact(text: string): string {
  return text.replace(EMAIL_RE, "[email hidden]").replace(PHONE_RE, "[phone hidden]")
}
