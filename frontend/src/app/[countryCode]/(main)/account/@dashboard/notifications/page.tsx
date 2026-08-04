import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { getNotifications } from "@lib/data/follows"
import NotificationsClient from "@modules/account/components/notifications"

export const metadata: Metadata = {
  title: "Notifications",
  description: "Updates and offers from stores you follow.",
}

export default async function NotificationsPage() {
  const customer = await retrieveCustomer().catch(() => null)
  if (!customer) {
    notFound()
  }

  const data = await getNotifications().catch(() => null)

  return (
    <NotificationsClient
      notifications={data?.notifications ?? []}
      unreadCount={data?.unread_count ?? 0}
    />
  )
}
