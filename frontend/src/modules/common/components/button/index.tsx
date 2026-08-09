import { Button as MedusaButton, clx } from "@medusajs/ui"
import React from "react"

type BrandVariant = "primary" | "surface" | "ghost" | "danger"
type MedusaVariant = React.ComponentProps<typeof MedusaButton>["variant"]

type BrandButtonProps = Omit<
  React.ComponentProps<typeof MedusaButton>,
  "variant"
> & {
  variant?: BrandVariant
  rounded?: "pill" | "control"
}

const VARIANT_MAP: Record<BrandVariant, NonNullable<MedusaVariant>> = {
  primary: "primary",
  surface: "secondary",
  ghost: "transparent",
  danger: "danger",
}

/**
 * Brand Button. Builds on the Medusa Button (which already ships all six
 * microstates: default, hover, focus, active, disabled, loading) and applies
 * the How's u design tokens: pill primary CTA in the brand accent, muted
 * surfaces, hairline ghosts, semantic danger.
 */
const Button = ({
  variant = "primary",
  rounded = "pill",
  className,
  ...props
}: BrandButtonProps) => {
  return (
    <MedusaButton
      {...props}
      variant={VARIANT_MAP[variant]}
      className={clx(
        "font-medium transition-colors duration-fast",
        rounded === "pill" ? "!rounded-control" : "!rounded-control",
        className
      )}
    />
  )
}

export default Button
