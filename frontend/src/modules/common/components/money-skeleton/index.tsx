import { clx } from "@medusajs/ui"
import React from "react"

import { Skeleton } from "@medusajs/ui"

type MoneySkeletonProps = {
  width?: number
  className?: string
}

/**
 * Skeleton that matches the final MoneyText footprint: mono face,
 * inline block, tabular. Prevents layout shift during load.
 */
const MoneySkeleton = ({ width = 64, className }: MoneySkeletonProps) => {
  return (
    <Skeleton
      className={clx("inline-block align-baseline", className)}
      style={{ width }}
    />
  )
}

export default MoneySkeleton