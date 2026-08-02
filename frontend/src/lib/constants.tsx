import React from "react"
import { Cash, CreditCard, CurrencyDollarSolid } from "@medusajs/icons"

/* Map of payment provider_id to their title and icon. Add in any payment providers you want to use. */
export const paymentInfoMap: Record<
  string,
  { title: string; icon: React.JSX.Element }
> = {
  "pp_crypto-usdc_crypto-usdc": {
    title: "Pay with USDC",
    icon: <CurrencyDollarSolid />,
  },
  pp_paystack_paystack: {
    title: "Paystack",
    icon: <Cash />,
  },
  pp_flutterwave_flutterwave: {
    title: "Flutterwave",
    icon: <Cash />,
  },
  pp_system_default: {
    title: "Manual Payment",
    icon: <CreditCard />,
  },
  // Add more payment providers here
}

// Frictionless managed-wallet USDC rail — no wallet, seed phrase, or private
// key needed from the buyer. The settlement is handled by the platform's
// custodian (Circle developer-controlled wallets).
export const isUsdc = (providerId?: string) => {
  return providerId?.startsWith("pp_crypto-usdc")
}

export const isManual = (providerId?: string) => {
  return providerId?.startsWith("pp_system_default")
}

export const isPaystackLike = (providerId?: string) => {
  return providerId?.startsWith("pp_paystack") || providerId?.startsWith("pp_flutterwave")
}

// Add currencies that don't need to be divided by 100
export const noDivisionCurrencies = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau",
]