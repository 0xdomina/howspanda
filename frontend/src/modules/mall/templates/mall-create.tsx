"use client"

import { useRouter } from "next/navigation"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { CreateMallForm } from "@modules/mall/components/seller-mall-tools"
import type { SellerProduct } from "@lib/data/seller"

const MallCreateTemplate = ({
  products,
  availableBalanceNgn,
}: {
  products: SellerProduct[]
  availableBalanceNgn?: number | null
}) => {
  const router = useRouter()
  return (
    <div className="figma-container flex-1 py-10 small:py-16">
      <div className="mb-6">
        <LocalizedClientLink href="/malls" className="text-sm text-ink-muted hover:text-ink">
          ← All malls
        </LocalizedClientLink>
      </div>
      <div className="mx-auto max-w-2xl">
        <CreateMallForm products={products} availableBalanceNgn={availableBalanceNgn} onDone={() => router.push("/malls")} />
      </div>
    </div>
  )
}

export default MallCreateTemplate
