import { MedusaContainer } from "@medusajs/framework/types"
import { NOTIFICATIONS_MODULE } from "../../modules/notifications"
import type NotificationsModuleService from "../../modules/notifications/service"

export type TeamInviteEmailInput = {
  to: string
  storeName: string
  ownerName?: string | null
}

// Best-effort notification email when a store owner invites an existing
// platform user to the team. OFF BY DEFAULT (TEAM_INVITE_EMAIL_ENABLED=true to
// switch on), mirroring the KYC OTP seam — the invite flow must never depend on
// a mail provider being configured. Enqueues into the durable outbox; the
// drain job does the actual send. Callers should treat failures as non-fatal
// and let the invite complete regardless.
export async function sendTeamInviteEmail(
  container: MedusaContainer,
  input: TeamInviteEmailInput
): Promise<void> {
  if (process.env.TEAM_INVITE_EMAIL_ENABLED !== "true") {
    return
  }

  const attributed = input.ownerName ? ` by ${input.ownerName}` : ""
  const subject = `You've been added to ${input.storeName} on How's u`
  const html = [
    `<p>You've been invited to the <strong>${input.storeName}</strong> store on How's u${attributed}.</p>`,
    `<p>Sign in with your existing How's u account to manage products, orders and delivery for the store.</p>`,
    `<p>Once signed in, head to your seller dashboard to get started.</p>`,
  ].join("")

  const notifications =
    container.resolve<NotificationsModuleService>(NOTIFICATIONS_MODULE)

  await notifications.enqueueEmail({
    kind: "team_invite",
    recipient: input.to,
    to: input.to,
    subject,
    body_html: html,
    payload: { store_name: input.storeName },
  })
}
