import { Metadata } from "next"
import { notFound } from "next/navigation"

import { retrieveMall } from "@lib/data/mall"
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
  const mall = await retrieveMall(id).catch(() => null)

  if (!mall) {
    notFound()
  }

  return <MallDetailClient mall={mall} detail={mall} />
}
