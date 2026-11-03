import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge, Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { Panel } from "@/pages/admin/AdminLayout";
import { useApp } from "@/lib/store";
import { api, downloadCsv, errMsg, inr, openPdf } from "@/lib/api";

const run = async (fn, msg, after) => { try { await fn(); toast.success(msg); after && after(); } catch (e) { toast.error(errMsg(e)); } };
const TabBar = ({ tabs }) => <TabsList className="mb-4 bg-white">{tabs.map(([v, l]) => <TabsTrigger key={v} value={v} data-testid={`tab-${v}`}>{l}</TabsTrigger>)}</TabsList>;

export function Invoices() {
  const { can } = useApp();
  const [q, setQ] = useState("");
  const { data, reload } = useLoad(() => api.get(`/admin/invoices?q=${encodeURIComponent(q)}`).then((r) => r.data), [q]);
  const cancel = (i) => { const reason = window.prompt(`Reason for cancelling ${i.number}? A credit note will be issued.`); if (reason) run(() => api.post(`/admin/invoices/${i.id}/cancel`, { reason }), "Invoice cancelled with credit note", reload); };
  return (
    <div>
      <PageHead title="Invoices & payments" sub="Issued invoices are never overwritten — corrections use cancellation with a credit note." />
      <input className="field mb-4 max-w-xs" placeholder="Search invoice, order, customer" value={q} onChange={(e) => setQ(e.target.value)} data-testid="invoices-search" />
      {!data ? <Skeleton className="h-64" /> : <Tabs defaultValue="inv"><TabBar tabs={[["inv", "Invoices"], ["cn", "Credit notes"]]} />
        <TabsContent value="inv"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Order</th><th>Taxable</th><th>GST</th><th>Total</th><th>Balance</th><th>Status</th><th /></tr></thead><tbody>
          {data.items.map((i) => <tr key={i.id} data-testid={`invoice-row-${i.number}`}><td className="font-semibold">{i.number}</td><td className="text-xs">{i.created_at.slice(0, 10)}</td><td>{i.party.business_name || i.party.name}</td><td>{i.order_number}</td><td>{inr(i.taxable)}</td><td>{inr(i.tax)}</td><td>{inr(i.grand_total)}</td><td>{inr(i.grand_total - i.amount_paid)}</td><td><Badge status={i.status} /></td>
            <td className="space-x-2 whitespace-nowrap text-xs"><button className="underline" onClick={() => openPdf(`/invoices/${i.id}/pdf`).catch((e) => toast.error(errMsg(e)))}><FileDown className="inline h-3 w-3" />PDF</button>{can("invoices.edit") && i.status === "issued" && <button className="text-red-600 underline" data-testid={`invoice-cancel-${i.number}`} onClick={() => cancel(i)}>Cancel + credit note</button>}</td></tr>)}
        </tbody></table>{!data.items.length && <p className="p-6 text-center text-sm text-stone-500">No invoices yet. Generate them from confirmed orders.</p>}</div></TabsContent>
        <TabsContent value="cn"><div className="border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Credit note</th><th>Invoice</th><th>Amount</th><th>Reason</th><th>By</th></tr></thead><tbody>{data.credit_notes.map((c) => <tr key={c.id}><td>{c.number}</td><td>{c.invoice_number}</td><td>{inr(c.amount)}</td><td>{c.reason}</td><td className="text-xs">{c.by}</td></tr>)}</tbody></table></div></TabsContent>
      </Tabs>}
    </div>
  );
}

export function Inventory() {
  const { can } = useApp();
  const [q, setQ] = useState(""); const [low, setLow] = useState(false);
  const { data, reload } = useLoad(() => api.get(`/admin/inventory?q=${encodeURIComponent(q)}&low=${low}`).then((r) => r.data), [q, low]);
  const { data: mv, reload: reloadMv } = useLoad(() => api.get("/admin/inventory/movements").then((r) => r.data));
  const [adj, setAdj] = useState({ sku: "", type: "receipt", qty: "", note: "" });
  return (
    <div>
      <PageHead title="Inventory" sub="Every change is written to the stock ledger with who made it.">
        <Btn variant="line" onClick={() => downloadCsv("/admin/inventory?export=true", "inventory.csv")} data-testid="inventory-export-btn">Export CSV</Btn>
      </PageHead>
      {can("inventory.edit") && <Panel title="Stock movement" className="mb-4"><div className="grid gap-2 sm:grid-cols-5">
        <input className="field" placeholder="SKU" data-testid="adj-sku" value={adj.sku} onChange={(e) => setAdj({ ...adj, sku: e.target.value })} />
        <select className="field" data-testid="adj-type" value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value })}><option value="receipt">Receipt (+)</option><option value="reduction">Reduction (−)</option><option value="adjustment">Adjustment (±)</option><option value="count">Physical count (set to)</option></select>
        <input type="number" className="field" placeholder="Qty" data-testid="adj-qty" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} />
        <input className="field" placeholder="Note / reference" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
        <Btn data-testid="adj-submit-btn" onClick={() => run(() => api.post("/admin/inventory/adjust", { ...adj, qty: Number(adj.qty) }), "Stock updated", () => { reload(); reloadMv(); setAdj({ ...adj, qty: "", note: "" }); })}>Apply</Btn></div></Panel>}
      <Tabs defaultValue="stock"><TabBar tabs={[["stock", "Stock levels"], ["ledger", "Movement ledger"]]} />
        <TabsContent value="stock">
          <div className="mb-3 flex flex-wrap items-center gap-4"><input className="field max-w-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} data-testid="low-stock-filter" />Low stock only</label>
            {data && <span className="ml-auto text-sm">Stock valuation (at cost): <b data-testid="stock-valuation">{inr(data.valuation)}</b></span>}</div>
          {!data ? <Skeleton className="h-64" /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>SKU</th><th>Product</th><th>Variant</th><th>Stock</th><th>Reorder at</th><th>Cost</th><th>Value</th></tr></thead><tbody>
            {data.items.map((r) => <tr key={r.sku} data-testid={`stock-row-${r.sku}`}><td>{r.sku}</td><td>{r.name}</td><td>{r.variant}</td><td className={r.stock <= r.reorder_level ? "font-bold text-red-600" : ""}>{r.stock}</td><td>{r.reorder_level}</td><td>{inr(r.cost)}</td><td>{inr(r.value)}</td></tr>)}</tbody></table></div>}
        </TabsContent>
        <TabsContent value="ledger"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>When</th><th>SKU</th><th>Type</th><th>Qty</th><th>Balance</th><th>Ref</th><th>By</th><th>Note</th></tr></thead><tbody>
          {(mv || []).map((m) => <tr key={m.id}><td className="text-xs">{m.at.slice(0, 16).replace("T", " ")}</td><td>{m.sku}</td><td>{m.type}</td><td className={m.qty < 0 ? "text-red-600" : "text-emerald-700"}>{m.qty > 0 ? "+" : ""}{m.qty}</td><td>{m.balance_after}</td><td className="text-xs">{m.ref}</td><td className="text-xs">{m.by}</td><td className="text-xs">{m.note}</td></tr>)}</tbody></table></div></TabsContent>
      </Tabs>
    </div>
  );
}

export function Coupons() {
  const { data, reload } = useLoad(() => api.get("/admin/coupons").then((r) => r.data));
  const [f, setF] = useState({ code: "", type: "percent", value: "", min_order: 0, max_discount: 0, starts: "", ends: "", usage_limit: 0, active: true });
  return (
    <div>
      <PageHead title="Coupons" sub="Coupon discounts apply to the order subtotal before GST." />
      <Panel title="Create / update coupon" className="mb-4"><div className="grid gap-2 sm:grid-cols-4">
        <Field label="Code"><input className="field" data-testid="coupon-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Type"><select className="field" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">Percent</option><option value="flat">Flat ₹</option></select></Field>
        <Field label="Value"><input type="number" className="field" data-testid="coupon-value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
        <Field label="Min order ₹"><input type="number" className="field" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} /></Field>
        <Field label="Max discount ₹ (0 = none)"><input type="number" className="field" value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} /></Field>
        <Field label="Starts"><input type="date" className="field" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></Field>
        <Field label="Ends"><input type="date" className="field" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></Field>
        <Field label="Usage limit (0 = unlimited)"><input type="number" className="field" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} /></Field>
        <Btn data-testid="coupon-save-btn" onClick={() => run(() => api.post("/admin/coupons", { ...f, value: Number(f.value), min_order: Number(f.min_order), max_discount: Number(f.max_discount), usage_limit: Number(f.usage_limit) }), "Coupon saved", reload)}>Save coupon</Btn></div></Panel>
      <div className="border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Window</th><th>Used</th><th>Status</th><th /></tr></thead><tbody>
        {(data || []).map((c) => <tr key={c.code} data-testid={`coupon-row-${c.code}`}><td className="font-semibold">{c.code}</td><td>{c.type === "percent" ? `${c.value}%` : inr(c.value)}</td><td>{inr(c.min_order)}</td><td className="text-xs">{c.starts || "—"} → {c.ends || "—"}</td><td>{c.used}{c.usage_limit ? `/${c.usage_limit}` : ""}</td><td><Badge status={c.active ? "active" : "inactive"} /></td>
          <td className="space-x-2 text-xs"><button className="underline" onClick={() => setF(c)}>Edit</button>{c.active && <button className="text-red-600 underline" onClick={() => run(() => api.delete(`/admin/coupons/${c.code}`), "Deactivated", reload)}>Deactivate</button>}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export function Service() {
  const { can } = useApp();
  const { data: enq, reload } = useLoad(() => api.get("/admin/enquiries").then((r) => r.data));
  const { data: rets, reload: reloadR } = useLoad(() => can("returns.edit") ? api.get("/admin/returns").then((r) => r.data) : Promise.resolve([]));
  const NEXT = { requested: ["approved", "rejected"], approved: ["received"], received: ["closed"] };
  return (
    <div>
      <PageHead title="Enquiries & returns" sub="Website contact, bulk, quotation and newsletter requests plus return/replacement requests." />
      <Tabs defaultValue="enq"><TabBar tabs={[["enq", "Enquiries"], ["ret", "Returns & replacements"]]} />
        <TabsContent value="enq"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Date</th><th>Type</th><th>From</th><th>Message / items</th><th>Status</th></tr></thead><tbody>
          {(enq || []).map((e) => <tr key={e.id} data-testid={`enquiry-row-${e.id}`}><td className="text-xs">{e.created_at.slice(0, 10)}</td><td>{e.type}</td><td>{e.name}<br /><span className="text-xs text-stone-500">{e.email} {e.phone} {e.company}</span></td><td className="max-w-md text-xs">{e.message}{e.items?.length > 0 && <><br /><b>{e.items.map((i) => `${i.sku}×${i.qty}`).join(", ")}</b></>}</td>
            <td><select className="field w-auto py-1 text-xs" value={e.status} onChange={(ev) => run(() => api.post(`/admin/enquiries/${e.id}/status`, { status: ev.target.value }), "Updated", reload)}>{["new", "contacted", "quoted", "closed"].map((s) => <option key={s}>{s}</option>)}</select></td></tr>)}
        </tbody></table>{!enq?.length && <p className="p-6 text-center text-sm text-stone-500">No enquiries yet.</p>}</div></TabsContent>
        <TabsContent value="ret"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Return</th><th>Order</th><th>Customer</th><th>Items</th><th>Kind / reason</th><th>Status</th><th /></tr></thead><tbody>
          {(rets || []).map((r) => <tr key={r.id}><td>{r.number}</td><td>{r.order_number}</td><td>{r.customer_name}</td><td className="text-xs">{r.items.map((i) => `${i.sku}×${i.qty}`).join(", ")}</td><td className="text-xs">{r.kind}: {r.reason}</td><td><Badge status={r.status} /></td>
            <td className="space-x-2 text-xs">{(NEXT[r.status] || []).map((s) => <button key={s} className="underline" data-testid={`return-${r.number}-${s}`} onClick={() => run(() => api.post(`/admin/returns/${r.id}/status`, { status: s }), `Marked ${s}`, reloadR)}>{s}</button>)}</td></tr>)}
        </tbody></table><p className="p-3 text-xs text-stone-500">Marking "received" puts items back into stock via the ledger. Record any refund on the order.</p></div></TabsContent>
      </Tabs>
    </div>
  );
}

export function Staff() {
  const { data, reload } = useLoad(() => api.get("/admin/users").then((r) => r.data));
  const { data: logs } = useLoad(() => api.get("/admin/audit").then((r) => r.data));
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div>
      <PageHead title="Staff & audit" sub="People sign up on the site; promote them to a staff role here. Permissions are enforced on the server." />
      <Tabs defaultValue="users"><TabBar tabs={[["users", "Users & roles"], ["perms", "Role permissions"], ["audit", "Audit log"]]} />
        <TabsContent value="users"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead><tbody>
          {data.users.map((u) => <tr key={u.user_id} data-testid={`user-row-${u.email}`}><td>{u.name}</td><td>{u.email}</td><td className="text-xs">{u.created_at?.slice(0, 10)}</td>
            <td><select className="field w-auto py-1" data-testid={`role-select-${u.email}`} value={u.role} onChange={(e) => run(() => api.patch(`/admin/users/${u.user_id}/role`, { role: e.target.value }), "Role updated", reload)}>{data.roles.map((r) => <option key={r} value={r}>{r === "admin" ? "super admin" : r.replace(/_/g, " ")}</option>)}</select></td></tr>)}
        </tbody></table></div></TabsContent>
        <TabsContent value="perms"><div className="grid gap-3 md:grid-cols-2">{Object.entries(data.perms).map(([r, ps]) => <Panel key={r} title={r === "admin" ? "Super admin" : r.replace(/_/g, " ")}><p className="text-xs leading-relaxed text-stone-600">{ps.includes("*") ? "All permissions" : ps.join(" · ") || "Storefront only"}</p></Panel>)}</div></TabsContent>
        <TabsContent value="audit"><div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
          {(logs || []).map((a) => <tr key={a.id}><td className="text-xs">{a.at.slice(0, 19).replace("T", " ")}</td><td className="text-xs">{a.user_email}</td><td>{a.action}</td><td>{a.entity}</td><td className="max-w-md truncate text-xs">{JSON.stringify(a.details)}</td></tr>)}</tbody></table></div></TabsContent>
      </Tabs>
    </div>
  );
}
