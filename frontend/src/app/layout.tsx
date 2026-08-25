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
  openGraph: {
    title: "How's u — Shop more. Sell more.",
    description:
      "Discover products from independent sellers and share your next find.",
    siteName: "How's u",
    type: "website",
    images: [
      {
        url: "/opengraph-image.jpg",
        alt: "How's u marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "How's u — Shop more. Sell more.",
    description:
      "Discover products from independent sellers and share your next find.",
    images: ["/opengraph-image.jpg"],
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const initialWishlist = await loadWishlist()
  const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"

  return (
    <html
      lang="en"
      data-mode="light"
    >
      <body className="bg-paper font-sans text-ink antialiased">
        <WishlistProvider initialItems={initialWishlist}><main className="relative page-enter">{props.children}</main></WishlistProvider>
        <script
          // Auto-wake: the moment any visitor lands anywhere on the platform,
          // ping the API so a sleeping free-tier backend boots while the human
          // reads the page — by the time they sign in or act, it is ready.
          dangerouslySetInnerHTML={{
            __html: `try{fetch(${JSON.stringify(backendUrl + "/health")},{mode:"no-cors",cache:"no-store"}).catch(function(){})}catch(e){}`,
          }}
        />
      </body>
    </html>
  )
}
