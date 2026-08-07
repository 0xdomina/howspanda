import { MedusaError } from "@medusajs/framework/utils"

export type TeamInviteEmailInput = {
  to: string
  storeName: string
  ownerName?: string | null
}

// Best-effort notification email when a store owner invites an existing
// platform user to the team. OFF BY DEFAULT (TEAM_INVITE_EMAIL_ENABLED=true to
// switch on), mirroring the KYC OTP seam — the invite flow must never depend on
// a mail provider being configured. Callers should treat failures as
// non-fatal and let the invite complete regardless.
export async function sendTeamInviteEmail(
  input: TeamInviteEmailInput
): Promise<void> {
  if (process.env.TEAM_INVITE_EMAIL_ENABLED !== "true") {
    return
  }

  const apiKey = process.env.EMAIL_API_KEY
  if (!apiKey) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "EMAIL_API_KEY is not configured"
    )
  }
  const from = process.env.EMAIL_FROM || "team@howsu.local"

  const attributed = input.ownerName
    ? ` by ${input.ownerName}`
    : ""
  const subject = `You've been added to ${input.storeName} on How's u`
  const html = [
    `<p>You've been invited to the <strong>${input.storeName}</strong> store on How's u${attributed}.</p>`,
    `<p>Sign in with your existing How's u account to manage products, orders and delivery for the store.</p>`,
    `<p>Once signed in, head to your seller dashboard to get started.</p>`,
  ].join("")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [input.to], subject, html }),
  })

  if (!response.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Failed to send the team invite email (${response.status})`
    )
  }
}