import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function Footer() {
  return <footer className="bg-black text-white" data-testid="footer">
    <div className="figma-container grid gap-12 py-16 small:grid-cols-[1.5fr_1fr_1fr]">
      <div><LocalizedClientLink href="/" className="font-display text-2xl font-bold">How&rsquo;s U</LocalizedClientLink><p className="mt-6 max-w-xs text-sm text-white/70">Shop more. Sell more. A marketplace where buyers, sellers, and couriers win.</p></div>
      <div><h2 className="font-semibold">Account</h2><ul className="mt-5 grid gap-3 text-sm text-white/70"><li><LocalizedClientLink href="/account" className="hover:text-white">My Account</LocalizedClientLink></li><li><LocalizedClientLink href="/cart" className="hover:text-white">Cart</LocalizedClientLink></li><li><LocalizedClientLink href="/store" className="hover:text-white">Shop</LocalizedClientLink></li><li><LocalizedClientLink href="/seller" className="hover:text-white">Become a seller</LocalizedClientLink></li></ul></div>
      <div><h2 className="font-semibold">Quick Link</h2><ul className="mt-5 grid gap-3 text-sm text-white/70"><li><LocalizedClientLink href="/content/privacy-policy" className="hover:text-white">Privacy Policy</LocalizedClientLink></li><li><LocalizedClientLink href="/content/terms-of-use" className="hover:text-white">Terms Of Use</LocalizedClientLink></li><li><LocalizedClientLink href="/contact" className="hover:text-white">Contact</LocalizedClientLink></li><li><LocalizedClientLink href="/deliver" className="hover:text-white">Delivery</LocalizedClientLink></li></ul></div>
    </div>
    <div className="border-t border-white/20 py-5 text-center text-xs text-white/50">© {new Date().getFullYear()} How&rsquo;s U. All rights reserved.</div>
  </footer>
}
