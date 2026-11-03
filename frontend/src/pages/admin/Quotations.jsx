import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Copy, FileDown, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge, Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { api, errMsg, inr, openPdf } from "@/lib/api";

const pdf = (p) => openPdf(p).catch((e) => toast.error(errMsg(e)));
const NEW = { customer_id: "", items: [{ sku: "", qty: 1, discount_pct: 0 }], shipping: 0, validity_days: 15, delivery_terms: "Dispatch within 7 working days", payment_terms: "100% advance", notes: "", internal_notes: "", ship_state: "" };

function Builder({ init, onDone }) {
  const [f, setF] = useState(init);
  const [cq, setCq] = useState("");
  const { data: custs } = useLoad(() => api.get(`/admin/customers?q=${encodeURIComponent(cq)}&limit=20`).then((r) => r.data.items), [cq]);
  const setI = (i, k, v) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const save = async () => {
    const body = { ...f, items: f.items.filter((i) => i.sku).map((i) => ({ ...i, qty: Number(i.qty), discount_pct: Number(i.discount_pct) })), shipping: Number(f.shipping), validity_days: Number(f.validity_days) };
    try { f.id ? await api.put(`/admin/quotations/${f.id}`, body) : await api.post("/admin/quotations", body); toast.success("Quotation saved as draft"); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="mt-4 space-y-4 text-sm">
      <Field label="Customer"><input className="field mb-1" placeholder="Search customers" data-testid="qb-customer-search" value={cq} onChange={(e) => setCq(e.target.value)} />
        <select className="field" data-testid="qb-customer-select" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}><option value="">Select…</option>{(custs || []).map((c) => <option key={c.id} value={c.id}>{c.business_name || c.name} · {c.email} · {c.price_group}</option>)}</select></Field>
      <p className="eyebrow">Items (priced by the server using the customer's price rules)</p>
      {f.items.map((it, i) => <div key={i} className="grid grid-cols-[1fr_80px_90px_auto] gap-2"><input className="field" placeholder="SKU" data-testid={`qb-sku-${i}`} value={it.sku} onChange={(e) => setI(i, "sku", e.target.value)} />
        <input type="number" className="field" data-testid={`qb-qty-${i}`} value={it.qty} onChange={(e) => setI(i, "qty", e.target.value)} /><input type="number" className="field" placeholder="Disc %" data-testid={`qb-disc-${i}`} value={it.discount_pct} onChange={(e) => setI(i, "discount_pct", e.target.value)} />
        <button onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>)}
      <button className="text-xs underline" data-testid="qb-add-item" onClick={() => setF({ ...f, items: [...f.items, { sku: "", qty: 1, discount_pct: 0 }] })}>+ Add item</button>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Shipping / other charges (₹)"><input type="number" className="field" value={f.shipping} onChange={(e) => setF({ ...f, shipping: e.target.value })} /></Field>
        <Field label="Valid for (days)"><input type="number" className="field" value={f.validity_days} onChange={(e) => setF({ ...f, validity_days: e.target.value })} /></Field>
        <Field label="Place of supply (state)"><input className="field" placeholder="Defaults to customer's address" value={f.ship_state} onChange={(e) => setF({ ...f, ship_state: e.target.value })} /></Field>
        <Field label="Delivery terms"><input className="field" value={f.delivery_terms} onChange={(e) => setF({ ...f, delivery_terms: e.target.value })} /></Field>
        <Field label="Payment terms" className="col-span-2"><input className="field" value={f.payment_terms} onChange={(e) => setF({ ...f, payment_terms: e.target.value })} /></Field>
        <Field label="Notes & conditions (printed)" className="col-span-2"><textarea className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Field label="Internal notes (not printed)" className="col-span-2"><textarea className="field" value={f.internal_notes} onChange={(e) => setF({ ...f, internal_notes: e.target.value })} /></Field>
      </div>
      <Btn variant="gold" className="w-full" onClick={save} data-testid="qb-save-btn">Save draft</Btn>
    </div>
  );
}

export default function Quotations() {
  const nav = useNavigate();
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState(null);
  const { data, reload } = useLoad(() => api.get(`/admin/quotations?status=${status}`).then((r) => r.data), [status]);
  const { data: rfqs } = useLoad(() => api.get("/admin/enquiries?type=quote").then((r) => r.data.filter((e) => e.status === "new")));
  const run = async (fn, msg) => { try { const r = await fn(); toast.success(msg); reload(); return r; } catch (e) { toast.error(errMsg(e)); } };
  const openEdit = async (id) => { const q = (await api.get(`/admin/quotations/${id}`)).data; setEdit({ ...NEW, ...q, items: q.lines.map((l) => ({ sku: l.sku, qty: l.qty, discount_pct: l.discount_pct })) }); };
  return (
    <div>
      <PageHead title="Quotations" sub="Draft → Sent → Accepted → Converted to order. Totals are calculated by the server and snapshotted.">
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="quotes-status-filter"><option value="">All</option>{["draft", "sent", "accepted", "rejected", "expired", "cancelled"].map((s) => <option key={s}>{s}</option>)}</select>
        <Btn onClick={() => setEdit({ ...NEW })} data-testid="quote-new-btn"><Plus className="h-4 w-4" />New quotation</Btn>
      </PageHead>
      {rfqs?.length > 0 && <div className="mb-4 border border-amber-200 bg-amber-50 p-4 text-sm"><p className="eyebrow mb-2">New quotation requests from the website</p>{rfqs.map((e) => <p key={e.id} className="py-1">{e.name} ({e.company || e.email}) — {e.items.map((i) => `${i.sku}×${i.qty}`).join(", ")} <span className="text-stone-500">{e.message}</span></p>)}<p className="mt-1 text-xs text-stone-500">Create the customer if needed, then a quotation. Manage requests under Enquiries & returns.</p></div>}
      {!data ? <Skeleton className="h-64" /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>No.</th><th>Customer</th><th>Date</th><th>Valid until</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {data.map((q) => <tr key={q.id} data-testid={`quote-row-${q.number}`}><td className="font-semibold">{q.number}</td><td>{q.party.business_name || q.party.name}</td><td className="text-xs">{q.created_at.slice(0, 10)}</td><td className="text-xs">{q.valid_until}</td><td>{inr(q.grand_total)}</td><td><Badge status={q.status} /></td>
          <td className="space-x-2 whitespace-nowrap text-xs">
            <button className="underline" onClick={() => pdf(`/quotations/${q.id}/pdf`)} data-testid={`quote-pdf-btn-${q.number}`}><FileDown className="inline h-3 w-3" />PDF</button>
            <button className="underline" onClick={() => pdf(`/quotations/${q.id}/pdf?proforma=true`)}>Proforma</button>
            {q.status === "draft" && <><button className="underline" onClick={() => openEdit(q.id)} data-testid={`quote-edit-${q.number}`}>Edit</button><button className="underline" data-testid={`quote-send-${q.number}`} onClick={() => run(() => api.post(`/admin/quotations/${q.id}/status`, { status: "sent" }), "Marked as sent")}>Mark sent</button></>}
            {q.status === "sent" && <><button className="underline" data-testid={`quote-accepted-${q.number}`} onClick={() => run(() => api.post(`/admin/quotations/${q.id}/status`, { status: "accepted" }), "Accepted")}>Accepted</button><button className="underline" onClick={() => run(() => api.post(`/admin/quotations/${q.id}/status`, { status: "rejected" }), "Rejected")}>Rejected</button></>}
            {q.status === "accepted" && !q.order_id && <button className="font-semibold text-[#8a6d33] underline" data-testid={`quote-convert-${q.number}`} onClick={async () => { const r = await run(() => api.post(`/admin/quotations/${q.id}/convert`), "Converted to order"); if (r) nav("/admin/orders"); }}>Convert to order</button>}
            {["draft", "sent", "accepted"].includes(q.status) && !q.order_id && <button className="text-red-600 underline" onClick={() => run(() => api.post(`/admin/quotations/${q.id}/status`, { status: "cancelled" }), "Cancelled")}>Cancel</button>}
            <button onClick={() => run(() => api.post(`/admin/quotations/${q.id}/duplicate`), "Duplicated as draft")} title="Duplicate"><Copy className="inline h-3 w-3" /></button>
          </td></tr>)}
      </tbody></table>{!data.length && <p className="p-6 text-center text-sm text-stone-500">No quotations yet.</p>}</div>}
      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)}><SheetContent className="w-full overflow-y-auto bg-white sm:max-w-xl"><SheetHeader><SheetTitle className="font-display text-2xl">{edit?.id ? `Edit ${edit.number}` : "New quotation"}</SheetTitle></SheetHeader>{edit && <Builder init={edit} onDone={() => { setEdit(null); reload(); }} />}</SheetContent></Sheet>
    </div>
  );
}
