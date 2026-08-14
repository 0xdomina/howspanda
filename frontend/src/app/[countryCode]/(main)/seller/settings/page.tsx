import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveSeller } from "@lib/data/seller"
import SellerSettingsClient from "@modules/seller/templates/seller-settings"

export const metadata: Metadata = {
  title: "Store settings",
  description: "Edit your store name, handle, logo and description.",
}

export default async function SellerSettingsPage() {
  const seller = await retrieveSeller().catch(() => null)
  if (!seller) {
    notFound()
  }

  return (
    <SellerSettingsClient
      admin={{ first_name: seller.first_name, last_name: seller.last_name }}
      store={{
        name: seller.seller?.name,
        handle: seller.seller?.handle,
        logo: seller.seller?.logo,
        cover_image: seller.seller?.cover_image,
        description: seller.seller?.description,
        accent_color: seller.seller?.accent_color,
        theme: seller.seller?.theme,
        crypto_payments_enabled: seller.seller?.crypto_payments_enabled,
      }}
      isOwner={seller.role !== "staff"}
    />
  )
}
