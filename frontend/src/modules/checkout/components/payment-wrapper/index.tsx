"use client"

import React from "react"
import { HttpTypes } from "@medusajs/types"

type PaymentWrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

/**
 * Payment wrapper. How's u settles with a frictionless managed-wallet USDC
 * rail (Circle developer-controlled wallets) — the buyer never handles a
 * wallet, seed phrase, or private key. No third-party iframe/Element is
 * needed, so this simply renders the checkout children as-is.
 */
const PaymentWrapper: React.FC<PaymentWrapperProps> = ({ children }) => {
  return <div>{children}</div>
}

export default PaymentWrapper