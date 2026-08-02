import { retrieveSeller } from "@lib/data/seller"
import SellerLayout from "@modules/seller/templates/seller-layout"
import LoginTemplate from "@modules/seller/templates/login-template"

export default async function SellerRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const seller = await retrieveSeller().catch(() => null)

  if (!seller) {
    return <LoginTemplate />
  }

  return (
    <SellerLayout seller={seller}>
      {children}
    </SellerLayout>
  )
}