import { Metadata } from "next"
import { requireAccountCustomer } from "@lib/data/account-guard"
import { getNotifications } from "@lib/data/follows"
import AccountWarmup from "@modules/account/components/account-warmup"
import NotificationsClient from "@modules/account/components/notifications"

export const metadata: Metadata = {
  title: "Notifications",
  description: "Updates and offers from stores you follow.",
}

export default async function NotificationsPage() {
  const { customer } = await requireAccountCustomer()
  if (!customer) {
    return <AccountWarmup title="Waking up your notifications" />
  }

  const data = await getNotifications().catch(() => null)

  return (
    <NotificationsClient
      notifications={data?.notifications ?? []}
      unreadCount={data?.unread_count ?? 0}
    />
  )
}
