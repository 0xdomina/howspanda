import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveSeller, listSellerProducts } from "@lib/data/seller"
import { listSellerProductRequests } from "@lib/data/product-requests"
import { sellerHasPermission } from "@lib/seller-permissions"
import SellerRequests from "@modules/seller/templates/seller-requests"

export const metadata: Metadata = { title: "Product requests", description: "Respond to buyer product requests." }

export default async function SellerRequestsPage() {
  const seller = await retrieveSeller().catch(() => null)
  if (!seller || !sellerHasPermission(seller, "requests")) notFound()
  const [requests, products] = await Promise.all([listSellerProductRequests(), listSellerProducts()])
  return <SellerRequests initial={requests} products={products} />
}
