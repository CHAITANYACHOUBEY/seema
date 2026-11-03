import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useApp } from "@/lib/store";
import { img, inr, ruleLabel } from "@/lib/api";

const QtyControl = ({ l, setQty }) => (
  <div className="flex items-center border border-stone-300">
    <button aria-label="Decrease" data-testid={`cart-dec-${l.sku}`} className="p-1.5 hover:bg-stone-100" onClick={() => setQty(l.sku, l.qty - 1)}><Minus className="h-3 w-3" /></button>
    <span className="w-9 text-center text-sm" data-testid={`cart-qty-${l.sku}`}>{l.qty}</span>
    <button aria-label="Increase" data-testid={`cart-inc-${l.sku}`} className="p-1.5 hover:bg-stone-100" onClick={() => setQty(l.sku, l.qty + 1)}><Plus className="h-3 w-3" /></button>
  </div>
);

export default function CartDrawer() {
  const { cart, drawer, setDrawer, setQty, site } = useApp();
  const nav = useNavigate();
  const free = site?.commerce?.free_shipping_above || 0;
  const pct = free ? Math.min(100, ((cart?.subtotal || 0) / free) * 100) : 0;
  const errs = Object.fromEntries((cart?.errors || []).map((e) => [e.sku, e.error]));
  return (
    <AnimatePresence>
      {drawer && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
          <motion.aside data-testid="cart-drawer" className="fixed right-0 top-0 z-[61] flex h-full w-full max-w-md flex-col bg-[#F9F8F6] shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 260 }}>
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
              <p className="font-display text-2xl">Your Cart <span className="text-base text-stone-500">({cart?.count || 0})</span></p>
              <button data-testid="cart-close" onClick={() => setDrawer(false)} aria-label="Close cart"><X className="h-5 w-5" /></button>
            </div>
            {free > 0 && cart?.lines?.length > 0 && (
              <div className="px-6 pt-4 text-xs text-stone-600">
                {pct >= 100 ? "You've unlocked free shipping." : `Add ${inr(free - cart.subtotal)} more for free shipping.`}
                <div className="mt-2 h-1 bg-stone-200"><motion.div className="h-1 bg-[#C5A059]" initial={{ width: 0 }} animate={{ width: `${pct}%` }} /></div>
              </div>
            )}
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {!cart?.lines?.length && (
                <div className="py-16 text-center text-stone-500"><ShoppingBag className="mx-auto mb-3 h-8 w-8" />Your cart is empty.</div>
              )}
              <AnimatePresence initial={false}>
                {cart?.lines?.map((l) => (
                  <motion.div layout key={l.sku} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex gap-4" data-testid={`cart-line-${l.sku}`}>
                    <img src={img(l.image)} alt={l.name} className="h-20 w-20 object-cover" />
                    <div className="min-w-0 flex-1">
                      <Link to={`/product/${l.slug}`} onClick={() => setDrawer(false)} className="line-clamp-2 text-sm font-semibold">{l.name}</Link>
                      <p className="text-xs text-stone-500">{l.variant} · {l.sku}</p>
                      {ruleLabel(l.rule) && <p className="text-[11px] font-semibold text-[#8a6d33]">{ruleLabel(l.rule)}</p>}
                      {errs[l.sku] && <p className="text-xs text-red-600" data-testid={`cart-error-${l.sku}`}>{errs[l.sku]}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <QtyControl l={l} setQty={setQty} />
                        <span className="text-sm font-semibold">{inr(l.line_subtotal)}</span>
                        <button aria-label="Remove" data-testid={`cart-remove-${l.sku}`} onClick={() => setQty(l.sku, 0)}><Trash2 className="h-4 w-4 text-stone-400 hover:text-red-600" /></button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {(cart?.errors || []).filter((e) => !e.sku).map((e, i) => <p key={i} className="text-xs text-red-600">{e.error}</p>)}
            </div>
            {cart?.lines?.length > 0 && (
              <div className="space-y-2 border-t border-stone-200 px-6 py-5 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span data-testid="cart-subtotal">{inr(cart.subtotal)}</span></div>
                <div className="flex justify-between text-stone-500"><span>GST (estimated)</span><span>{inr(cart.tax)}</span></div>
                <div className="flex justify-between text-stone-500"><span>Shipping</span><span>{cart.shipping ? inr(cart.shipping) : "Free"}</span></div>
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-bold"><span>Total</span><span data-testid="cart-total">{inr(cart.grand_total)}</span></div>
                <button data-testid="cart-checkout-btn" disabled={cart.errors?.length > 0} onClick={() => { setDrawer(false); nav("/checkout"); }}
                  className="btn-gold mt-3 w-full py-3.5 text-sm font-bold uppercase tracking-[0.2em] disabled:opacity-50">Checkout</button>
                <button data-testid="cart-quote-btn" onClick={() => { setDrawer(false); nav("/quote?from=cart"); }} className="btn-line w-full py-3 text-xs font-semibold uppercase tracking-[0.2em]">Request a quotation instead</button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
