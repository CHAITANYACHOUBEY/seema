import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Show } from "@clerk/react";
import { toast } from "sonner";
import { CheckCircle2, FileDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Btn, Empty, Field, Skeleton, useLoad } from "@/components/kit";
import { STATES, payWithRazorpay } from "@/pages/Checkout";
import { useApp } from "@/lib/store";
import { api, errMsg, img, inr, openPdf } from "@/lib/api";

const pdf = (path) => openPdf(path).catch((e) => toast.error(errMsg(e)));

function Orders() {
  const { data } = useLoad(() => api.get("/orders").then((r) => r.data));
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No orders yet" action={<Link to="/shop" className="underline">Start shopping</Link>} />;
  return <div className="divide-y divide-stone-200 border border-stone-200 bg-white">{data.map((o) => (
    <Link key={o.id} to={`/account/orders/${o.id}`} data-testid={`my-order-${o.number}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-stone-50">
      <div><p className="font-semibold">{o.number}</p><p className="text-xs text-stone-500">{o.created_at.slice(0, 10)}</p></div>
      <div className="flex items-center gap-2"><Badge status={o.status} /><Badge status={o.payment_status} /></div><span className="font-semibold">{inr(o.grand_total)}</span>
    </Link>))}</div>;
}

function Quotes() {
  const { data, reload } = useLoad(() => api.get("/my/quotations").then((r) => r.data));
  const respond = async (id, action) => { try { await api.post(`/my/quotations/${id}/respond`, { action }); toast.success(`Quotation ${action}ed`); reload(); } catch (e) { toast.error(errMsg(e)); } };
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No quotations" text="Quotations prepared by our sales team will appear here." action={<Link to="/quote" className="underline">Request a quotation</Link>} />;
  return <div className="space-y-3">{data.map((q) => (
    <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-white p-4" data-testid={`my-quote-${q.number}`}>
      <div><p className="font-semibold">{q.number}</p><p className="text-xs text-stone-500">Valid until {q.valid_until}</p></div><Badge status={q.status} /><span className="font-semibold">{inr(q.grand_total)}</span>
      <div className="flex gap-2"><Btn variant="line" onClick={() => pdf(`/quotations/${q.id}/pdf`)} data-testid={`quote-pdf-${q.number}`}><FileDown className="h-4 w-4" />PDF</Btn>
        {q.status === "sent" && <><Btn variant="gold" onClick={() => respond(q.id, "accept")} data-testid={`quote-accept-${q.number}`}>Accept</Btn><Btn variant="line" onClick={() => respond(q.id, "reject")}>Reject</Btn></>}</div>
    </div>))}</div>;
}

function Invoices() {
  const { data } = useLoad(() => api.get("/my/invoices").then((r) => r.data));
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No invoices yet" />;
  return <table className="admin-table w-full bg-white"><thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>
    {data.map((i) => <tr key={i.id}><td>{i.number}</td><td>{i.created_at.slice(0, 10)}</td><td>{inr(i.grand_total)}</td><td>{inr(i.grand_total - i.amount_paid)}</td><td><Badge status={i.status} /></td>
      <td><button className="text-[#8a6d33] underline" data-testid={`invoice-pdf-${i.number}`} onClick={() => pdf(`/invoices/${i.id}/pdf`)}>Download</button></td></tr>)}</tbody></table>;
}

function Wishlist() {
  const { data } = useLoad(() => api.get("/wishlist").then((r) => r.data));
  if (!data) return <Skeleton className="h-40" />;
  if (!data.items.length) return <Empty title="Your wishlist is empty" />;
  return <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{data.items.map((p) => <Link key={p.id} to={`/product/${p.slug}`} className="bg-white"><img src={img(p.images?.[0])} alt="" className="aspect-square w-full object-cover" /><p className="p-3 text-sm font-medium">{p.name}</p></Link>)}</div>;
}

function Profile() {
  const { me, refreshMe } = useApp();
  const c = me.customer;
  const [f, setF] = useState({ name: c.name || "", phone: c.phone || "", address: c.addresses?.[0] || { name: c.name || "", phone: "", line1: "", line2: "", city: "", state: "Gujarat", pincode: "" } });
  const save = async () => {
    try { await api.put("/me/profile", { name: f.name, phone: f.phone, addresses: f.address.line1 ? [f.address] : [] }); toast.success("Profile saved"); refreshMe(); } catch (e) { toast.error(errMsg(e)); }
  };
  const ad = (k, l) => <Field label={l}><input className="field" data-testid={`profile-addr-${k}`} value={f.address[k] || ""} onChange={(e) => setF({ ...f, address: { ...f.address, [k]: e.target.value } })} /></Field>;
  return <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
    <Field label="Name"><input className="field" data-testid="profile-name-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Phone"><input className="field" data-testid="profile-phone-input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
    <p className="eyebrow sm:col-span-2 mt-4">Default address</p>{ad("name", "Recipient")}{ad("phone", "Phone")}{ad("line1", "Address line 1")}{ad("line2", "Address line 2")}{ad("city", "City")}
    <Field label="State"><select className="field" value={f.address.state} onChange={(e) => setF({ ...f, address: { ...f.address, state: e.target.value } })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>{ad("pincode", "Pincode")}
    <Btn onClick={save} className="sm:col-span-2 sm:w-fit" data-testid="profile-save-btn">Save profile</Btn>
  </div>;
}

export function BusinessForm() {
  const { me, refreshMe } = useApp();
  const c = me.customer;
  const [f, setF] = useState({ customer_type: "wholesale", business_name: c.business_name || "", gstin: c.gstin || "", phone: c.phone || "", city: "", state: "Gujarat", message: "" });
  if (c.status === "approved" && c.customer_type !== "retail")
    return <div className="border border-emerald-200 bg-emerald-50 p-6" data-testid="business-approved"><p className="font-display text-2xl">Business account approved</p><p className="mt-1 text-sm">Type: {c.customer_type} · Price group: <b>{c.price_group}</b>{c.payment_terms ? ` · Terms: ${c.payment_terms}` : ""}</p>
      <Btn variant="line" className="mt-4" onClick={() => pdf("/my/pricelist.pdf")} data-testid="my-pricelist-btn"><FileDown className="h-4 w-4" />Download my price list</Btn></div>;
  if (c.status === "pending") return <div className="border border-amber-200 bg-amber-50 p-6" data-testid="business-pending"><p className="font-display text-2xl">Application under review</p><p className="mt-1 text-sm">We'll notify you once your business account is verified.</p></div>;
  const submit = async () => { try { await api.post("/me/business", f); toast.success("Application submitted"); refreshMe(); } catch (e) { toast.error(errMsg(e)); } };
  const inp = (k, l) => <Field label={l}><input className="field" data-testid={`business-${k}-input`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return <div className="grid max-w-2xl gap-4 sm:grid-cols-2" data-testid="business-form">
    {c.status === "rejected" && <p className="text-sm text-red-600 sm:col-span-2">Your previous application was not approved. You may re-apply with updated details.</p>}
    <Field label="Business type"><select className="field" data-testid="business-type-select" value={f.customer_type} onChange={(e) => setF({ ...f, customer_type: e.target.value })}>
      {[["wholesale", "Wholesaler / retailer"], ["dealer", "Dealer"], ["distributor", "Distributor"], ["contractor", "Contractor"], ["builder", "Builder"], ["interior_designer", "Interior designer"], ["business", "Other business"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
    {inp("business_name", "Business name")}{inp("gstin", "GSTIN (optional)")}{inp("phone", "Phone")}{inp("city", "City")}
    <Field label="State"><select className="field" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
    <Field label="About your business" className="sm:col-span-2"><textarea className="field min-h-[90px]" data-testid="business-message-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
    <Btn variant="gold" onClick={submit} className="sm:w-fit" data-testid="business-submit-btn">Submit application</Btn>
  </div>;
}

function Notifications() {
  const { data } = useLoad(() => api.get("/me/notifications").then((r) => r.data));
  if (!data) return <Skeleton className="h-40" />;
  if (!data.length) return <Empty title="No notifications" />;
  return <div className="divide-y divide-stone-200 border border-stone-200 bg-white">{data.map((n) => <Link to={n.link || "#"} key={n.id} className="block p-4 hover:bg-stone-50"><p className="font-semibold">{n.title}</p><p className="text-sm text-stone-500">{n.body} · {n.at.slice(0, 16).replace("T", " ")}</p></Link>)}</div>;
}

function AccountHome() {
  const { me } = useApp();
  if (!me) return <Skeleton className="m-10 h-60" />;
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="eyebrow">My account</p><h1 className="mt-2 font-display text-4xl font-semibold" data-testid="account-title">Hello, {me.customer.name || me.name}</h1>
      <p className="mt-1 text-sm text-stone-500">{me.email} · {me.channel === "retail" ? "Retail account" : `${me.channel} pricing active`}</p>
      <Tabs defaultValue="orders" className="mt-8">
        <TabsList className="flex h-auto flex-wrap justify-start bg-transparent p-0">
          {["orders", "quotations", "invoices", "wishlist", "profile", "business", "notifications"].map((t) => <TabsTrigger key={t} value={t} data-testid={`account-tab-${t}`} className="rounded-none border-b-2 border-transparent px-4 py-2 capitalize data-[state=active]:border-[#C5A059] data-[state=active]:bg-transparent data-[state=active]:shadow-none">{t === "business" ? "Business account" : t}{t === "notifications" && me.unread ? ` (${me.unread})` : ""}</TabsTrigger>)}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="orders"><Orders /></TabsContent><TabsContent value="quotations"><Quotes /></TabsContent><TabsContent value="invoices"><Invoices /></TabsContent>
          <TabsContent value="wishlist"><Wishlist /></TabsContent><TabsContent value="profile"><Profile /></TabsContent><TabsContent value="business"><BusinessForm /></TabsContent><TabsContent value="notifications"><Notifications /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function OrderDetail() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { me, refreshCart, setDrawer } = useApp();
  const nav = useNavigate();
  const { data: o, reload } = useLoad(() => api.get(`/orders/${id}`).then((r) => r.data), [id]);
  const [ret, setRet] = useState(null);
  if (!o) return <Skeleton className="m-10 h-80" />;
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const pay = async () => { try { const r = await api.post(`/orders/${id}/pay`); await payWithRazorpay(o, r.data, me, reload); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      {sp.get("placed") && <div className="mb-8 flex items-center gap-3 border border-emerald-200 bg-emerald-50 p-5" data-testid="order-placed-banner"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><div><p className="font-display text-2xl">Thank you! Your order is placed.</p><p className="text-sm text-stone-600">Order number {o.number}. {o.status === "pending_payment" ? "Payment is pending — complete it below." : "We'll notify you as it progresses."}</p></div></div>}
      <Link to="/account" className="text-xs uppercase tracking-widest text-stone-500">← My account</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="font-display text-4xl font-semibold" data-testid="order-number">{o.number}</h1><Badge status={o.status} testid="order-status" /><Badge status={o.payment_status} testid="order-payment-status" /></div>
      <div className="mt-6 flex flex-wrap gap-2">
        {o.status === "pending_payment" && <Btn variant="gold" onClick={pay} data-testid="order-pay-btn">Pay now</Btn>}
        {o.invoice && <Btn variant="line" onClick={() => pdf(`/invoices/${o.invoice.id}/pdf`)} data-testid="order-invoice-btn"><FileDown className="h-4 w-4" />Invoice {o.invoice.number}</Btn>}
        {["pending_payment", "confirmed"].includes(o.status) && <Btn variant="line" data-testid="order-cancel-btn" onClick={() => window.confirm("Cancel this order?") && act(() => api.post(`/orders/${id}/cancel`, { reason: "" }), "Order cancelled")}>Cancel order</Btn>}
        {o.status === "delivered" && <Btn variant="line" data-testid="order-return-btn" onClick={() => setRet({ reason: "", kind: "return", items: Object.fromEntries(o.lines.map((l) => [l.sku, 0])) })}>Request return / replacement</Btn>}
        <Btn variant="line" data-testid="order-reorder-btn" onClick={() => act(async () => { await api.post(`/orders/${id}/reorder`); await refreshCart(); setDrawer(true); nav("/shop"); }, "Items added to cart")}>Reorder</Btn>
      </div>
      {o.last_payment_error && o.status === "pending_payment" && <p className="mt-3 text-sm text-red-600">Last payment attempt failed: {o.last_payment_error}</p>}
      {ret && <div className="mt-6 space-y-3 border border-stone-200 bg-white p-5" data-testid="return-form">
        {o.lines.map((l) => <div key={l.sku} className="flex items-center justify-between text-sm"><span>{l.name} ({l.sku}) — bought {l.qty}</span><input type="number" min="0" max={l.qty} className="field w-24" value={ret.items[l.sku]} onChange={(e) => setRet({ ...ret, items: { ...ret.items, [l.sku]: e.target.value } })} /></div>)}
        <select className="field" value={ret.kind} onChange={(e) => setRet({ ...ret, kind: e.target.value })}><option value="return">Return</option><option value="replacement">Replacement</option></select>
        <textarea className="field" placeholder="Reason" data-testid="return-reason-input" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} />
        <Btn data-testid="return-submit-btn" onClick={() => act(async () => { await api.post(`/orders/${id}/return`, { reason: ret.reason, kind: ret.kind, items: Object.entries(ret.items).map(([sku, qty]) => ({ sku, qty: Number(qty) })) }); setRet(null); }, "Return requested")}>Submit request</Btn>
      </div>}
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 divide-y divide-stone-200 border border-stone-200 bg-white">{o.lines.map((l) => <div key={l.sku} className="flex gap-4 p-4 text-sm"><img src={img(l.image)} alt="" className="h-16 w-16 object-cover" /><div className="flex-1"><p className="font-semibold">{l.name}</p><p className="text-xs text-stone-500">{l.sku} · {l.qty} × {inr(l.unit_price)} · GST {l.gst_rate}%</p></div><span className="font-semibold">{inr(l.total)}</span></div>)}</div>
        <div className="space-y-4 text-sm">
          <div className="border border-stone-200 bg-white p-4 space-y-1"><div className="flex justify-between"><span>Subtotal</span><span>{inr(o.subtotal)}</span></div>{o.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>−{inr(o.discount)}</span></div>}<div className="flex justify-between"><span>GST</span><span>{inr(o.tax)}</span></div><div className="flex justify-between"><span>Shipping</span><span>{inr(o.shipping)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total</span><span data-testid="order-total">{inr(o.grand_total)}</span></div><div className="flex justify-between text-stone-500"><span>Paid</span><span>{inr(o.amount_paid)}</span></div></div>
          <div className="border border-stone-200 bg-white p-4"><p className="eyebrow mb-2">Ship to</p><p>{o.address.name}, {o.address.line1} {o.address.line2}, {o.address.city}, {o.address.state} {o.address.pincode} · {o.address.phone}</p></div>
          {o.shipment?.courier && <div className="border border-stone-200 bg-white p-4" data-testid="order-tracking"><p className="eyebrow mb-2">Shipment</p><p>{o.shipment.courier} · {o.shipment.tracking_number}</p>{o.shipment.tracking_url && <a href={o.shipment.tracking_url} target="_blank" rel="noreferrer" className="text-[#8a6d33] underline">Track shipment</a>}</div>}
          <div className="border border-stone-200 bg-white p-4"><p className="eyebrow mb-2">Timeline</p>{o.history.map((h, i) => <p key={i} className="text-xs"><b className="capitalize">{h.status.replace(/_/g, " ")}</b> · {h.at.slice(0, 16).replace("T", " ")}</p>)}</div>
          {o.returns?.map((r) => <div key={r.id} className="border border-stone-200 bg-white p-4 text-xs">Return {r.number}: <Badge status={r.status} /></div>)}
        </div>
      </div>
    </div>
  );
}

const Guard = ({ children }) => (<><Show when="signed-in">{children}</Show><Show when="signed-out"><Navigate to="/sign-in" replace /></Show></>);
export const AccountPage = () => <Guard><AccountHome /></Guard>;
export const OrderPage = () => <Guard><OrderDetail /></Guard>;
