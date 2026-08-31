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
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const initialWishlist = await loadWishlist()
  const backendHealthUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
    ? `${process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/\/$/, "")}/health`
    : "/api/backend/health"

  return (
    <html
      lang="en"
      data-mode="light"
    >
      <body className="bg-paper font-sans text-ink antialiased">
        <WishlistProvider initialItems={initialWishlist}><main className="relative page-enter">{props.children}</main></WishlistProvider>
        <script
          // Quietly start the backend through our same-origin health proxy so
          // the backend URL is never exposed in the page source.
          dangerouslySetInnerHTML={{
            __html: `try{fetch(${JSON.stringify(backendHealthUrl)},{mode:"no-cors",cache:"no-store"}).catch(function(){})}catch(e){}`,
          }}
        />
      </body>
    </html>
  )
}
