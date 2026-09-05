import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getNotifications } from "@lib/data/follows"

// Notification bell for the nav icon row (same weight as cart + wishlist).
// Fails silent: logged out or backend asleep shows a plain bell.
export default async function NotificationBell() {
  const data = await getNotifications().catch(() => null)
  const unread = data?.unread_count ?? 0

  return (
    <LocalizedClientLink
      href="/account/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      className="relative grid h-8 w-8 place-items-center rounded-full border border-ink-hairline text-lg transition-transform duration-fast active:scale-95"
      data-testid="nav-notification-bell"
    >
      <span aria-hidden="true">🔔</span>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </LocalizedClientLink>
  )
}
