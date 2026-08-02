"use client"

import Button from "@modules/common/components/button"
import React from "react"
import { useFormStatus } from "react-dom"

type SubmitVariant = "primary" | "secondary" | "transparent" | "danger" | null

const BRAND_VARIANT: Record<string, "primary" | "surface" | "ghost" | "danger"> = {
  primary: "primary",
  secondary: "surface",
  transparent: "ghost",
  danger: "danger",
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode
  variant?: SubmitVariant
  className?: string
  "data-testid"?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      size="large"
      rounded="pill"
      className={className}
      type="submit"
      isLoading={pending}
      variant={BRAND_VARIANT[variant ?? "primary"]}
      data-testid={dataTestId}
    >
      {children}
    </Button>
  )
}
