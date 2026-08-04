"use client"

import { useState, useTransition } from "react"
import { useParams } from "next/navigation"
import { followStore, unfollowStore } from "@lib/data/follows"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const FollowButton = ({
  handle,
  initialFollowing,
  initialCount,
}: {
  handle: string
  initialFollowing: boolean
  initialCount: number
}) => {
  const { countryCode } = useParams() as { countryCode: string }
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount] = useState(initialCount)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    setMessage(null)
    startTransition(async () => {
      const res = following
        ? await unfollowStore(handle)
        : await followStore(handle)
      if (res.success) {
        setFollowing(!following)
        if (typeof res.follower_count === "number") setCount(res.follower_count)
      } else {
        setMessage(res.error)
      }
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={toggle}
          className={`rounded-medium px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
            following
              ? "border border-ink-strong text-ink hover:bg-ink hover:text-white"
              : "bg-ink text-white hover:bg-ink/90"
          }`}
        >
          {isPending ? "…" : following ? "Following" : "Follow"}
        </button>
        <span className="text-sm text-ink-muted">
          {count.toLocaleString()} {count === 1 ? "follower" : "followers"}
        </span>
      </div>
      {message && (
        <p className="mt-2 text-sm text-ink-muted">
          {message}{" "}
          <LocalizedClientLink
            href={`/${countryCode}/account`}
            className="text-ink underline"
          >
            Sign in
          </LocalizedClientLink>
        </p>
      )}
    </div>
  )
}

export default FollowButton