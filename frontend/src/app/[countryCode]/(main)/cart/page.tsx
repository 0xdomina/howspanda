import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import CartTemplate from "@modules/cart/templates"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cart",
  description: "View your cart",
}

export default async function Cart() {
  // Parallel: cart and identity are independent. A backend nap resolves to
  // an empty cart view (with retry), never an error page.
  const [cart, customer] = await Promise.all([
    retrieveCart(undefined, undefined, "no-store").catch(() => null),
    retrieveCustomer().catch(() => null),
  ])

  return <CartTemplate cart={cart} customer={customer} />
}
