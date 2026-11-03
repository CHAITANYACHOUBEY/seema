import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge, Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api, downloadCsv, errMsg, inr } from "@/lib/api";

const TYPES = ["retail", "wholesale", "dealer", "distributor", "contractor", "builder", "interior_designer", "business"];

function Detail({ id, onClose, onChanged }) {
  const { can } = useApp();
  const { data, reload } = useLoad(() => api.get(`/admin/customers/${id}`).then((r) => r.data), [id]);
  const [f, setF] = useState(null);
  const [ap, setAp] = useState({ decision: "approve", price_group: "wholesale", credit_limit: 0, payment_terms: "", note: "" });
  const [np, setNp] = useState({ sku: "", price: "" });
  if (!data) return <Skeleton className="h-96" />;
  const c = f || data.customer;
  const run = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); onChanged(); } catch (e) { toast.error(errMsg(e)); } };
  const inp = (k, l) => <Field label={l}><input className="field" data-testid={`cust-${k}`} value={c[k] ?? ""} onChange={(e) => setF({ ...c, [k]: e.target.value })} /></Field>;
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2"><Badge status={data.customer.status} testid="cust-status" /><Badge status="draft">{data.customer.customer_type}</Badge><Badge status="draft">price: {data.customer.price_group}</Badge><span className="ml-auto font-semibold">Outstanding: {inr(data.outstanding)}</span></div>
      {data.customer.application && <div className="border border-amber-200 bg-amber-50 p-3 text-xs"><b>Application</b> ({data.customer.application.submitted_at?.slice(0, 10)}): {data.customer.application.customer_type} · {data.customer.application.business_name} · GSTIN {data.customer.application.gstin || "—"} · {data.customer.application.city} {data.customer.application.state}<br />{data.customer.application.message}</div>}
      {can("customers.approve") && <div className="grid grid-cols-2 gap-2 border border-stone-200 p-3">
        <Field label="Decision"><select className="field" data-testid="approval-decision" value={ap.decision} onChange={(e) => setAp({ ...ap, decision: e.target.value })}><option value="approve">Approve</option><option value="reject">Reject</option><option value="deactivate">Deactivate</option></select></Field>
        <Field label="Price group"><select className="field" data-testid="approval-price-group" value={ap.price_group} onChange={(e) => setAp({ ...ap, price_group: e.target.value })}>{["retail", "wholesale", "dealer", "distributor"].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Credit limit (₹)"><input type="number" className="field" value={ap.credit_limit} onChange={(e) => setAp({ ...ap, credit_limit: Number(e.target.value) })} /></Field>
        <Field label="Payment terms"><input className="field" value={ap.payment_terms} onChange={(e) => setAp({ ...ap, payment_terms: e.target.value })} /></Field>
        <Field label="Note to customer" className="col-span-2"><input className="field" value={ap.note} onChange={(e) => setAp({ ...ap, note: e.target.value })} /></Field>
        <Btn variant="gold" className="col-span-2" data-testid="approval-submit-btn" onClick={() => run(() => api.post(`/admin/customers/${id}/approval`, ap), "Account updated")}>Apply decision</Btn></div>}
      <div className="grid grid-cols-2 gap-3">{inp("name", "Name")}{inp("business_name", "Business")}{inp("email", "Email")}{inp("phone", "Phone")}{inp("gstin", "GSTIN")}{inp("sales_rep", "Sales rep")}{inp("follow_up", "Follow-up date")}
        <Field label="Type"><select className="field" value={c.customer_type} onChange={(e) => setF({ ...c, customer_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        {can("customers.approve") && <Field label="Internal notes" className="col-span-2"><textarea className="field" data-testid="cust-notes" value={c.notes || ""} onChange={(e) => setF({ ...c, notes: e.target.value })} /></Field>}
        {can("customers.edit") && <Btn className="col-span-2" data-testid="cust-save-btn" onClick={() => run(() => api.put(`/admin/customers/${id}`, { ...c, credit_limit: undefined, price_group: undefined, status: undefined, payment_terms: undefined }), "Saved")}>Save details</Btn>}</div>
      {can("prices.view_wholesale") && <div><p className="eyebrow mb-2">Negotiated prices (highest priority)</p>
        {data.prices.map((p) => <div key={p.sku} className="flex justify-between border-b border-stone-100 py-1"><span>{p.sku}</span><span>{inr(p.price)} {can("prices.edit") && <button onClick={() => run(() => api.delete(`/admin/customers/${id}/prices/${p.sku}`), "Removed")}><X className="inline h-3 w-3" /></button>}</span></div>)}
        {can("prices.edit") && <div className="mt-2 flex gap-2"><input className="field" placeholder="SKU" data-testid="np-sku" value={np.sku} onChange={(e) => setNp({ ...np, sku: e.target.value })} /><input className="field" placeholder="Price excl. GST" data-testid="np-price" value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} /><Btn data-testid="np-add-btn" onClick={() => run(() => api.post(`/admin/customers/${id}/prices`, { sku: np.sku, price: Number(np.price) }), "Price set")}>Set</Btn></div>}</div>}
      <div><p className="eyebrow mb-2">Orders</p>{data.orders.map((o) => <p key={o.id} className="flex justify-between border-b border-stone-100 py-1"><span>{o.number} <Badge status={o.status} /></span><span>{inr(o.grand_total)}</span></p>)}</div>
      <div><p className="eyebrow mb-2">Quotations</p>{data.quotations.map((q) => <p key={q.id} className="flex justify-between border-b border-stone-100 py-1"><span>{q.number} <Badge status={q.status} /></span><span>{inr(q.grand_total)}</span></p>)}</div>
      <div><p className="eyebrow mb-2">Invoices</p>{data.invoices.map((i) => <p key={i.id} className="flex justify-between border-b border-stone-100 py-1"><span>{i.number}</span><span>{inr(i.grand_total)} · due {inr(i.grand_total - i.amount_paid)}</span></p>)}</div>
      <div><p className="eyebrow mb-2">Change log</p>{data.changes.map((a) => <p key={a.id} className="text-xs text-stone-500">{a.at.slice(0, 16)} · {a.user_email} · {a.action} {Object.keys(a.details || {}).join(", ")}</p>)}</div>
    </div>
  );
}

export default function Customers() {
  const { can } = useApp();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState("");
  const status = sp.get("status") || ""; const type = sp.get("type") || "";
  const [open, setOpen] = useState(null);
  const [create, setCreate] = useState(null);
  const { data, reload } = useLoad(() => api.get(`/admin/customers?q=${encodeURIComponent(q)}&status=${status}&type=${type}`).then((r) => r.data), [q, status, type]);
  const setP = (k, v) => { const p = new URLSearchParams(sp); v ? p.set(k, v) : p.delete(k); setSp(p); };
  const add = async () => { try { const r = await api.post("/admin/customers", create); toast.success("Customer created"); setCreate(null); reload(); setOpen(r.data.id); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div>
      <PageHead title="Customers" sub="Retail, wholesale, dealers, distributors and project buyers.">
        <Btn variant="line" onClick={() => downloadCsv(`/admin/customers?export=true&status=${status}&type=${type}`, "customers.csv")} data-testid="customers-export-btn">Export CSV</Btn>
        {can("customers.edit") && <Btn onClick={() => setCreate({ name: "", email: "", phone: "", business_name: "", gstin: "", customer_type: "retail", addresses: [] })} data-testid="customer-new-btn"><Plus className="h-4 w-4" />New customer</Btn>}
      </PageHead>
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="field max-w-xs" placeholder="Search name, phone, GSTIN" data-testid="customers-search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field w-auto" data-testid="customers-status-filter" value={status} onChange={(e) => setP("status", e.target.value)}><option value="">All statuses</option>{["pending", "approved", "active", "rejected", "inactive"].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="field w-auto" value={type} onChange={(e) => setP("type", e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      {!data ? <Skeleton className="h-64" /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Name</th><th>Business</th><th>Contact</th><th>Type</th><th>Price group</th><th>Status</th><th>Joined</th></tr></thead><tbody>
        {data.items.map((c) => <tr key={c.id} className="cursor-pointer" onClick={() => setOpen(c.id)} data-testid={`customer-row-${c.email || c.id}`}><td className="font-semibold">{c.name}</td><td>{c.business_name}</td><td className="text-xs">{c.email}<br />{c.phone}</td><td>{c.customer_type}</td><td>{c.price_group}</td><td><Badge status={c.status} /></td><td className="text-xs">{c.created_at?.slice(0, 10)}</td></tr>)}
      </tbody></table><p className="p-3 text-xs text-stone-500">{data.total} customers</p></div>}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}><SheetContent className="w-full overflow-y-auto bg-white sm:max-w-xl"><SheetHeader><SheetTitle className="font-display text-2xl">Customer</SheetTitle></SheetHeader>{open && <Detail id={open} onClose={() => setOpen(null)} onChanged={reload} />}</SheetContent></Sheet>
      <Sheet open={!!create} onOpenChange={(o) => !o && setCreate(null)}><SheetContent className="w-full bg-white sm:max-w-md"><SheetHeader><SheetTitle className="font-display text-2xl">New customer</SheetTitle></SheetHeader>
        {create && <div className="mt-4 space-y-3">{["name", "business_name", "email", "phone", "gstin"].map((k) => <Field key={k} label={k.replace("_", " ")}><input className="field" data-testid={`new-cust-${k}`} value={create[k]} onChange={(e) => setCreate({ ...create, [k]: e.target.value })} /></Field>)}
          <Field label="Type"><select className="field" value={create.customer_type} onChange={(e) => setCreate({ ...create, customer_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Btn variant="gold" className="w-full" onClick={add} data-testid="new-cust-save">Create customer</Btn></div>}
      </SheetContent></Sheet>
    </div>
  );
}
