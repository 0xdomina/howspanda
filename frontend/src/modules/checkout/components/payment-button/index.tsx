"use client"

import { isManual, isUsdc } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button } from "@medusajs/ui"
import React, { useState } from "react"
import ErrorMessage from "../error-message"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const paymentSession = cart.payment_collection?.payment_sessions?.[0]

  const providerId = paymentSession?.provider_id

  // USDC (managed wallet) and manual settlement both complete instantly for
  // the buyer — a single place-order action. No card entry, no redirect, no
  // wallet/seed phrase/private key.
  if (isUsdc(providerId) || isManual(providerId)) {
    return (
      <InstantPaymentButton cart={cart} notReady={!cartIsReady(cart)} data-testid={dataTestId} />
    )
  }

  return <InstantPaymentButton cart={cart} notReady={!cartIsReady(cart)} data-testid={dataTestId} />
}

const cartIsReady = (cart: HttpTypes.StoreCart) =>
  Boolean(
    cart &&
      cart.shipping_address &&
      cart.billing_address &&
      cart.email &&
      (cart.shipping_methods?.length ?? 0) >= 1
  )

const InstantPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePayment = async () => {
    setSubmitting(true)
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage error={errorMessage} data-testid="payment-error-message" />
    </>
  )
}

export default PaymentButton