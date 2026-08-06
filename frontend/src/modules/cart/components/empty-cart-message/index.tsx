import { Heading, Text } from "@medusajs/ui"

import InteractiveLink from "@modules/common/components/interactive-link"

const EmptyCartMessage = () => {
  return (
    <div className="py-48 px-2 flex flex-col justify-center items-start" data-testid="empty-cart-message">
      <Heading
        level="h1"
        className="font-display text-3xl font-semibold tracking-tight text-ink gap-x-2 items-baseline"
      >
        Cart
      </Heading>
      <Text className="text-base-regular text-ink-muted mt-4 mb-6 max-w-[32rem]">
        You don&apos;t have anything in your cart yet. Ready to shop more and
        sell more? Browse the store and build a cart.
      </Text>
      <div>
        <InteractiveLink href="/store">Explore products</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
