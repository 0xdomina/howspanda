import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default function Footer() {
  return <footer className="bg-black text-white" data-testid="footer">
    <section className="border-b border-white/20 bg-white py-12 text-ink small:py-16" aria-label="How's U promises">
      <div className="figma-container grid grid-cols-1 gap-10 text-center small:grid-cols-3">
        {[["↗", "LOW-COST DELIVERY", "Affordable delivery options arranged between buyers and sellers"], ["◉", "24/7 CUSTOMER SERVICE", "Friendly support whenever you need a hand"], ["✓", "BUYER PROTECTION", "We help resolve issues fairly when an order goes wrong"]].map(([icon, title, copy]) => <div key={title}><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-black text-2xl text-white">{icon}</div><h2 className="mt-4 text-sm font-bold">{title}</h2><p className="mt-2 text-sm text-ink-muted">{copy}</p></div>)}
      </div>
    </section>
    <div className="figma-container grid gap-12 py-16 small:grid-cols-[1.5fr_1fr_1fr]">
      <div><LocalizedClientLink href="/" className="font-display text-2xl font-bold">How&rsquo;s U</LocalizedClientLink><p className="mt-6 max-w-xs text-sm text-white/70">Shop more. Sell more. A marketplace where buyers, sellers, and couriers win.</p></div>
      <div><h2 className="font-semibold">Account</h2><ul className="mt-5 grid gap-3 text-sm text-white/70"><li><LocalizedClientLink href="/account" className="hover:text-white">My Account</LocalizedClientLink></li><li><LocalizedClientLink href="/cart" className="hover:text-white">Cart</LocalizedClientLink></li><li><LocalizedClientLink href="/store" className="hover:text-white">Shop</LocalizedClientLink></li><li><LocalizedClientLink href="/seller" className="hover:text-white">Become a seller</LocalizedClientLink></li></ul></div>
      <div><h2 className="font-semibold">Quick Link</h2><ul className="mt-5 grid gap-3 text-sm text-white/70"><li><LocalizedClientLink href="/content/privacy-policy" className="hover:text-white">Privacy Policy</LocalizedClientLink></li><li><LocalizedClientLink href="/content/terms-of-use" className="hover:text-white">Terms Of Use</LocalizedClientLink></li><li><LocalizedClientLink href="/contact" className="hover:text-white">Contact</LocalizedClientLink></li><li><LocalizedClientLink href="/deliver" className="hover:text-white">Delivery</LocalizedClientLink></li></ul></div>
    </div>
    <div className="border-t border-white/20 py-5 text-center text-xs text-white/50">© {new Date().getFullYear()} How&rsquo;s U. All rights reserved.</div>
  </footer>
}
