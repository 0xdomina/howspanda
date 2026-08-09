import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google"
import "styles/globals.css"
import { WishlistProvider } from "@modules/wishlist/context"
import { loadWishlist } from "@lib/data/wishlist"

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

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
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body className="bg-paper font-sans text-ink antialiased">
        <WishlistProvider initialItems={initialWishlist}><main className="relative">{props.children}</main></WishlistProvider>
      </body>
    </html>
  )
}
