import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveMall, listMallGoods } from "@lib/data/mall"
import { retrieveCustomer } from "@lib/data/customer"
import MallDetailClient from "@modules/mall/templates/mall-detail"

export const metadata: Metadata = {
  title: "Mall",
  description: "A community sales event.",
}

export default async function MallDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [mall, customer, goods] = await Promise.all([
    retrieveMall(id).catch(() => null),
    retrieveCustomer().catch(() => null),
    listMallGoods(id).catch(() => []),
  ])

  if (!mall) {
    notFound()
  }

  return (
    <MallDetailClient
      mall={mall}
      detail={mall}
      goods={goods}
      customerEmail={customer?.email ?? null}
    />
  )
}
