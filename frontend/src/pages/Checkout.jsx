import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Show } from "@clerk/react";
import { toast } from "sonner";
import { Field } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api, errMsg, img, inr } from "@/lib/api";

const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Dadra and Nagar Haveli and Daman and Diu", "Jammu and Kashmir", "Other"];
export { STATES };

const loadRzp = () => new Promise((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => res(true); s.onerror = () => res(false);
  document.body.appendChild(s);
});

export const payWithRazorpay = async (order, rz, me, onDone) => {
  if (!(await loadRzp())) return toast.error("Could not load the payment window");
  new window.Razorpay({
    key: rz.key_id, amount: rz.amount, currency: "INR", order_id: rz.order_id, name: "Seema Enterprise", description: order.number,
    prefill: { name: me?.name, email: me?.email, contact: order.address?.phone }, theme: { color: "#1E2024" },
    handler: async (res) => {
      try { await api.post("/payments/razorpay/verify", { order_id: order.id, ...res }); toast.success("Payment verified"); }
      catch (e) { toast.error(errMsg(e)); }
      onDone();
    },
    modal: { ondismiss: onDone },
  }).open();
};

function CheckoutInner() {
  const { cart, site, me, refreshCart, setCart } = useApp();
  const nav = useNavigate();
  const saved = me?.customer?.addresses?.[0];
  const [a, setA] = useState(saved || { name: me?.name || "", phone: me?.customer?.phone || "", line1: "", line2: "", city: "", state: "Gujarat", pincode: "" });
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [pm, setPm] = useState("");
  const [sum, setSum] = useState(null);
  const [busy, setBusy] = useState(false);
  const idem = useRef(crypto.randomUUID());
  const rz = site?.razorpay?.enabled;
  useEffect(() => { setPm(rz ? "razorpay" : site?.commerce?.cod_enabled ? "cod" : "bank_transfer"); }, [rz, site]);
  useEffect(() => {
    api.get(`/cart?coupon=${encodeURIComponent(applied)}&state=${encodeURIComponent(a.state)}`).then((r) => setSum(r.data));
  }, [applied, a.state, cart]);
  if (cart && !cart.lines?.length) return <div className="py-24 text-center"><p className="font-display text-3xl">Your cart is empty</p><Link to="/shop" className="mt-4 inline-block underline">Continue shopping</Link></div>;
  const couponErr = sum?.errors?.find((e) => !e.sku);
  const place = async () => {
    setBusy(true);
    try {
      const r = await api.post("/checkout", { address: a, payment_method: pm, coupon: applied, notes: "" }, { headers: { "Idempotency-Key": idem.current } });
      const o = r.data.order;
      setCart(null); refreshCart();
      if (r.data.razorpay) await payWithRazorpay(o, r.data.razorpay, me, () => nav(`/account/orders/${o.id}?placed=1`));
      else { if (r.data.payment_error) toast.error(r.data.payment_error); nav(`/account/orders/${o.id}?placed=1`); }
    } catch (e) { toast.error(errMsg(e)); refreshCart(); } finally { setBusy(false); }
  };
  const inp = (k, label, cls = "") => <Field label={label} className={cls}><input data-testid={`checkout-${k}-input`} className="field" value={a[k] || ""} onChange={(e) => setA({ ...a, [k]: e.target.value })} /></Field>;
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-5 py-12 lg:grid-cols-12 lg:px-8">
      <div className="lg:col-span-7">
        <h1 className="font-display text-4xl font-semibold">Checkout</h1>
        <p className="eyebrow mt-8 mb-4">Delivery address</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {inp("name", "Full name")}{inp("phone", "Phone")}{inp("line1", "Address line 1", "sm:col-span-2")}{inp("line2", "Address line 2 (optional)", "sm:col-span-2")}{inp("city", "City")}
          <Field label="State"><select data-testid="checkout-state-select" className="field" value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          {inp("pincode", "Pincode")}
        </div>
        <p className="eyebrow mt-10 mb-4">Payment method</p>
        <div className="space-y-2" data-testid="payment-methods">
          {[["razorpay", "Pay online — UPI, cards, net banking", rz], ["cod", "Cash on delivery", site?.commerce?.cod_enabled], ["bank_transfer", "Bank transfer (order confirmed, pay against invoice)", site?.commerce?.bank_transfer_enabled]].map(([k, l, on]) => on && (
            <label key={k} className={`flex cursor-pointer items-center gap-3 border p-4 text-sm transition-colors ${pm === k ? "border-[#1E2024] bg-white" : "border-stone-300"}`}>
              <input type="radio" data-testid={`pay-${k}`} checked={pm === k} onChange={() => setPm(k)} />{l}</label>))}
          {!rz && <p className="text-xs text-stone-500">Online payment will appear here once the payment gateway is connected.</p>}
          {pm === "bank_transfer" && site?.commerce?.bank_details && <p className="whitespace-pre-line bg-white p-4 text-xs text-stone-600">{site.commerce.bank_details}</p>}
        </div>
      </div>
      <aside className="h-fit border border-stone-200 bg-white p-6 lg:col-span-5 lg:sticky lg:top-28" data-testid="order-summary">
        <p className="font-display text-2xl">Order summary</p>
        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">{sum?.lines?.map((l) => <div key={l.sku} className="flex gap-3 text-sm"><img src={img(l.image)} alt="" className="h-14 w-14 object-cover" /><div className="flex-1"><p className="font-medium">{l.name}</p><p className="text-xs text-stone-500">{l.variant} × {l.qty}</p></div><span>{inr(l.line_subtotal)}</span></div>)}</div>
        <div className="mt-5 flex gap-2"><input data-testid="coupon-input" className="field" placeholder="Coupon code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} /><button data-testid="coupon-apply-btn" onClick={() => setApplied(coupon)} className="btn-line px-4 text-xs font-semibold uppercase">Apply</button></div>
        {couponErr && <p className="mt-1 text-xs text-red-600" data-testid="coupon-error">{couponErr.error}</p>}
        {sum && <div className="mt-5 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{inr(sum.subtotal)}</span></div>
          {sum.discount > 0 && <div className="flex justify-between text-emerald-700" data-testid="summary-discount"><span>Coupon {sum.coupon?.code}</span><span>− {inr(sum.discount)}</span></div>}
          {sum.inter_state ? <div className="flex justify-between text-stone-600"><span>IGST</span><span>{inr(sum.igst)}</span></div> : <>
            <div className="flex justify-between text-stone-600"><span>CGST</span><span>{inr(sum.cgst)}</span></div><div className="flex justify-between text-stone-600"><span>SGST</span><span>{inr(sum.sgst)}</span></div></>}
          <div className="flex justify-between text-stone-600"><span>Shipping</span><span>{sum.shipping ? inr(sum.shipping) : "Free"}</span></div>
          <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-bold"><span>Total</span><span data-testid="summary-total">{inr(sum.grand_total)}</span></div>
        </div>}
        {sum?.errors?.filter((e) => e.sku).map((e) => <p key={e.sku} className="mt-2 text-xs text-red-600">{e.sku}: {e.error}</p>)}
        <button data-testid="place-order-btn" disabled={busy || !pm || sum?.errors?.some((e) => e.sku)} onClick={place} className="btn-gold mt-6 w-full py-4 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-50">{busy ? "Placing order…" : "Place order"}</button>
        <p className="mt-3 text-[11px] text-stone-500">Prices, tax and totals are re-calculated securely on our server when you place the order.</p>
      </aside>
    </div>
  );
}

export default function Checkout() {
  const { me } = useApp();
  return (<>
    <Show when="signed-in">{me ? <CheckoutInner /> : <div className="py-24 text-center text-stone-500">Loading…</div>}</Show>
    <Show when="signed-out"><Navigate to="/sign-in" replace /></Show>
  </>);
}
