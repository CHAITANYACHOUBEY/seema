import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge, Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api, errMsg, inr, openPdf } from "@/lib/api";

const NEXT = { confirmed: ["processing", "cancelled"], processing: ["packed", "cancelled"], packed: ["shipped", "cancelled"], shipped: ["delivered"], pending_payment: ["cancelled"] };
const pdf = (p) => openPdf(p).catch((e) => toast.error(errMsg(e)));

function OrderSheet({ id, onChanged }) {
  const { can } = useApp();
  const { data: o, reload } = useLoad(() => api.get(`/orders/${id}`).then((r) => r.data), [id]);
  const [st, setSt] = useState({ status: "", courier: "", tracking_number: "", tracking_url: "", note: "" });
  const [pay, setPay] = useState({ amount: "", method: "bank_transfer", reference: "" });
  if (!o) return <Skeleton className="h-96" />;
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const due = o.grand_total - o.amount_paid;
  return (
    <div className="mt-4 space-y-5 text-sm">
      <div className="flex flex-wrap gap-2"><Badge status={o.status} testid="admin-order-status" /><Badge status={o.payment_status} testid="admin-order-payment" /><Badge status="draft">{o.channel}</Badge><Badge status="draft">{o.payment_method}</Badge>{o.refund_due && <Badge status="cancelled">Refund due</Badge>}</div>
      <p><b>{o.customer.business_name || o.customer.name}</b> · {o.customer.email} · {o.customer.phone}{o.customer.gstin ? ` · GSTIN ${o.customer.gstin}` : ""}<br />{o.address.line1} {o.address.line2}, {o.address.city}, {o.address.state} {o.address.pincode}</p>
      <table className="admin-table w-full"><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Rule</th><th>Total</th></tr></thead><tbody>{o.lines.map((l) => <tr key={l.sku}><td>{l.name}<br /><span className="text-xs text-stone-500">{l.sku}</span></td><td>{l.qty}</td><td>{inr(l.unit_price)}</td><td className="text-xs">{l.rule}</td><td>{inr(l.total)}</td></tr>)}</tbody></table>
      <div className="grid grid-cols-2 gap-1 bg-stone-50 p-3"><span>Taxable</span><span className="text-right">{inr(o.taxable)}</span><span>CGST / SGST / IGST</span><span className="text-right">{inr(o.cgst)} / {inr(o.sgst)} / {inr(o.igst)}</span><span>Shipping</span><span className="text-right">{inr(o.shipping)}</span><b>Grand total</b><b className="text-right">{inr(o.grand_total)}</b><span>Paid</span><span className="text-right">{inr(o.amount_paid)}</span></div>
      <div className="flex flex-wrap gap-2">
        <Btn variant="line" onClick={() => pdf(`/admin/orders/${id}/packing-slip`)} data-testid="packing-slip-btn"><FileDown className="h-4 w-4" />Packing slip</Btn>
        {o.invoice ? <Btn variant="line" onClick={() => pdf(`/invoices/${o.invoice.id}/pdf`)} data-testid="admin-invoice-pdf-btn"><FileDown className="h-4 w-4" />Invoice {o.invoice.number}</Btn>
          : can("invoices.edit") && !["cancelled", "pending_payment"].includes(o.status) && <Btn variant="gold" onClick={() => run(() => api.post(`/admin/orders/${id}/invoice`), "Invoice generated")} data-testid="generate-invoice-btn">Generate GST invoice</Btn>}
      </div>
      {can("orders.edit") && NEXT[o.status] && <div className="space-y-2 border border-stone-200 p-3"><p className="eyebrow">Update status</p>
        <select className="field" data-testid="order-next-status" value={st.status} onChange={(e) => setSt({ ...st, status: e.target.value })}><option value="">Choose…</option>{NEXT[o.status].map((s) => <option key={s}>{s}</option>)}</select>
        {st.status === "shipped" && <div className="grid grid-cols-2 gap-2"><input className="field" placeholder="Courier" data-testid="ship-courier" value={st.courier} onChange={(e) => setSt({ ...st, courier: e.target.value })} /><input className="field" placeholder="Tracking no." data-testid="ship-tracking" value={st.tracking_number} onChange={(e) => setSt({ ...st, tracking_number: e.target.value })} /><input className="field col-span-2" placeholder="Tracking URL" value={st.tracking_url} onChange={(e) => setSt({ ...st, tracking_url: e.target.value })} /></div>}
        <input className="field" placeholder="Note (optional)" value={st.note} onChange={(e) => setSt({ ...st, note: e.target.value })} />
        <Btn disabled={!st.status} data-testid="order-status-submit" onClick={() => run(() => api.post(`/admin/orders/${id}/status`, st), "Status updated")}>Update</Btn></div>}
      {can("payments.record") && <div className="space-y-2 border border-stone-200 p-3"><p className="eyebrow">Record payment / refund</p>
        <div className="grid grid-cols-3 gap-2"><input className="field" placeholder={`Amount (due ${inr(due)})`} data-testid="pay-amount" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
          <select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{["bank_transfer", "upi", "cash", "cheque", "razorpay", "other"].map((m) => <option key={m}>{m}</option>)}</select>
          <input className="field" placeholder="Reference" data-testid="pay-ref" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
        <div className="flex gap-2"><Btn data-testid="pay-record-btn" onClick={() => run(() => api.post(`/admin/orders/${id}/payments`, { ...pay, amount: Number(pay.amount) }), "Payment recorded")}>Record payment</Btn>
          <Btn variant="line" data-testid="refund-record-btn" onClick={() => run(() => api.post(`/admin/orders/${id}/refunds`, { ...pay, amount: Number(pay.amount) }), "Refund recorded")}>Record refund</Btn></div></div>}
      <div><p className="eyebrow mb-1">History</p>{o.history.map((h, i) => <p key={i} className="text-xs">{h.at.slice(0, 16).replace("T", " ")} · <b>{h.status}</b> · {h.by} {h.note}</p>)}</div>
    </div>
  );
}

export default function Orders() {
  const [f, setF] = useState({ status: "", q: "", channel: "" });
  const [open, setOpen] = useState(null);
  const { data, reload } = useLoad(() => api.get(`/admin/orders?status=${f.status}&q=${encodeURIComponent(f.q)}&channel=${f.channel}`).then((r) => r.data), [f.status, f.q, f.channel]);
  return (
    <div>
      <PageHead title="Orders" sub="Fulfilment, payments, shipping and invoicing." />
      <div className="mb-4 flex flex-wrap gap-3"><input className="field max-w-xs" placeholder="Order no. or customer" data-testid="orders-search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className="field w-auto" data-testid="orders-status-filter" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{["pending_payment", "confirmed", "processing", "packed", "shipped", "delivered", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="field w-auto" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="">All channels</option><option value="retail">Retail</option><option value="b2b">Wholesale/B2B</option></select></div>
      {!data ? <Skeleton className="h-64" /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Channel</th><th>Total</th><th>Paid</th><th>Status</th><th>Payment</th></tr></thead><tbody>
        {data.items.map((o) => <tr key={o.id} className="cursor-pointer" onClick={() => setOpen(o.id)} data-testid={`admin-order-row-${o.number}`}><td className="font-semibold">{o.number}</td><td className="text-xs">{o.created_at.slice(0, 10)}</td><td>{o.customer.business_name || o.customer.name}</td><td>{o.channel}</td><td>{inr(o.grand_total)}</td><td>{inr(o.amount_paid)}</td><td><Badge status={o.status} /></td><td><Badge status={o.payment_status} /></td></tr>)}
      </tbody></table>{!data.items.length && <p className="p-6 text-center text-sm text-stone-500">No orders yet.</p>}</div>}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}><SheetContent className="w-full overflow-y-auto bg-white sm:max-w-2xl"><SheetHeader><SheetTitle className="font-display text-2xl">Order</SheetTitle></SheetHeader>{open && <OrderSheet id={open} onChanged={reload} />}</SheetContent></Sheet>
    </div>
  );
}
export { Field };
