import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"
import { WishlistProvider } from "@modules/wishlist/context"
import { loadWishlist } from "@lib/data/wishlist"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    template: "%s | How's u",
    default: "How's u — Shop more. Sell more.",
  },
  description:
    "How's u is an AI-powered marketplace that helps people shop more and sell more.",
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const initialWishlist = await loadWishlist()

  return (
    <html
      lang="en"
      data-mode="light"
    >
      <body className="bg-paper font-sans text-ink antialiased">
        <WishlistProvider initialItems={initialWishlist}><main className="relative">{props.children}</main></WishlistProvider>
      </body>
    </html>
  )
}
