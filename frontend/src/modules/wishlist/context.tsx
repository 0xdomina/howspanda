"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { syncWishlist } from "@lib/data/wishlist"

export type WishlistItem = {
  id: string
  handle?: string
  title: string
  thumbnail?: string | null
  price?: string
}

type WishlistContextValue = {
  items: WishlistItem[]
  has: (id: string) => boolean
  toggle: (item: WishlistItem) => void
  remove: (id: string) => void
  clear: () => void
}

const WishlistContext = createContext<WishlistContextValue | null>(null)
const STORAGE_KEY = "hows-u-wishlist"
const serverWishlist: WishlistItem[] = []

const readWishlist = (): WishlistItem[] => {
  if (typeof window === "undefined") return serverWishlist
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as WishlistItem[]) : []
  } catch {
    return []
  }
}

const writeWishlist = (items: WishlistItem[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Local storage is an enhancement; the wishlist remains usable in memory.
  }
}

export function WishlistProvider({
  children,
  initialItems = null,
}: {
  children: React.ReactNode
  initialItems?: WishlistItem[] | null
}) {
  const [items, setItems] = useState<WishlistItem[]>(() => {
    const serverItems = initialItems ?? []
    const localItems = readWishlist()
    return Array.from(new Map([...serverItems, ...localItems].map((item) => [item.id, item])).values())
  })

  useEffect(() => {
    if (initialItems !== null) {
      void syncWishlist(items)
    }
  }, [initialItems, items])

  const value = useMemo<WishlistContextValue>(() => ({
    items,
    has: (id) => items.some((item) => item.id === id),
    toggle: (item) => setItems((current) => {
      const next = current.some((entry) => entry.id === item.id)
        ? current.filter((entry) => entry.id !== item.id)
        : [...current, item]
      writeWishlist(next)
      void syncWishlist(next)
      return next
    }),
    remove: (id) => setItems((current) => {
      const next = current.filter((item) => item.id !== id)
      writeWishlist(next)
      void syncWishlist(next)
      return next
    }),
    clear: () => setItems(() => {
      writeWishlist([])
      void syncWishlist([])
      return []
    }),
  }), [items])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error("useWishlist must be used inside WishlistProvider")
  return context
}
