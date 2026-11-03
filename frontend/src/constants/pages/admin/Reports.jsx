import { useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { Panel } from "@/pages/admin/AdminLayout";
import { useApp } from "@/lib/store";
import { api, downloadCsv, errMsg, inr, openPdf } from "@/lib/api";

function CatalogueBuilder() {
  const { site, can } = useApp();
  const [f, setF] = useState({ title: "Product Catalogue", category_ids: [], price_list: "retail", customer_id: "", include_specs: true });
  const [cq, setCq] = useState("");
  const { data: custs } = useLoad(() => f.price_list === "customer" ? api.get(`/admin/customers?q=${encodeURIComponent(cq)}&limit=20`).then((r) => r.data.items) : Promise.resolve([]), [cq, f.price_list]);
  const lists = [["none", "No prices"], ["mrp", "MRP"], ["retail", "Retail"], ...(can("prices.view_wholesale") ? [["wholesale", "Wholesale"], ["dealer", "Dealer"], ["distributor", "Distributor"], ["customer", "Customer-specific"]] : [])];
  return (
    <Panel title="Catalogue & price-list builder (PDF)">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Title"><input className="field" data-testid="cb-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Price list"><select className="field" data-testid="cb-price-list" value={f.price_list} onChange={(e) => setF({ ...f, price_list: e.target.value })}>{lists.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.price_list === "customer" && <Field label="Customer"><input className="field mb-1" placeholder="Search" value={cq} onChange={(e) => setCq(e.target.value)} /><select className="field" value={f.customer_id} onChange={(e) => setF({ ...f, customer_id: e.target.value })}><option value="">Select…</option>{(custs || []).map((c) => <option key={c.id} value={c.id}>{c.business_name || c.name}</option>)}</select></Field>}
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.include_specs} onChange={(e) => setF({ ...f, include_specs: e.target.checked })} />Include specifications</label>
      </div>
      <p className="eyebrow mt-4 mb-2">Categories (none selected = all products)</p>
      <div className="flex flex-wrap gap-2">{(site?.categories || []).map((c) => { const on = f.category_ids.includes(c.id); return <button key={c.id} onClick={() => setF({ ...f, category_ids: on ? f.category_ids.filter((x) => x !== c.id) : [...f.category_ids, c.id] })} className={`border px-3 py-1 text-xs ${on ? "border-[#1E2024] bg-[#1E2024] text-white" : "border-stone-300"}`}>{c.name}</button>; })}</div>
      <Btn variant="gold" className="mt-4" data-testid="cb-generate-btn" onClick={() => openPdf("/admin/catalogue", f).catch((e) => toast.error(errMsg(e)))}>Generate & preview PDF</Btn>
    </Panel>
  );
}

export default function Reports() {
  const [f, setF] = useState({ frm: "", to: "", group: "month" });
  const qs = `frm=${f.frm}&to=${f.to}&group=${f.group}`;
  const { data } = useLoad(() => api.get(`/admin/reports/sales?${qs}`).then((r) => r.data), [qs]);
  const t = data?.totals;
  return (
    <div className="space-y-6">
      <PageHead title="Reports" sub="Revenue = order value (incl. GST). Collected = payments received. Outstanding = unpaid balance. Margin is estimated from recorded product costs.">
        <Field label="From"><input type="date" className="field" value={f.frm} onChange={(e) => setF({ ...f, frm: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Group by"><select className="field" data-testid="report-group" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}>{["day", "month", "year", "category", "product", "customer", "channel", "employee"].map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Btn variant="line" className="self-end" data-testid="report-export-btn" onClick={() => downloadCsv(`/admin/reports/sales?${qs}&export=true`, `sales-${f.group}.csv`)}>Export CSV</Btn>
      </PageHead>
      {!data ? <Skeleton className="h-64" /> : <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">{[["Revenue", inr(t.revenue)], ["Collected", inr(t.collected)], ["Outstanding", inr(t.outstanding)], ["Est. gross margin", inr(t.est_margin)], ["Discounts", inr(t.discounts)], ["Quote conversion", `${t.quote_conversion}%`], ["Cancelled orders", t.cancelled], ["Returns", t.returns]].map(([l, v]) =>
          <div key={l} className="border border-stone-200 bg-white p-4" data-testid={`report-${l.toLowerCase().replace(/[ .]/g, "-")}`}><p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">{l}</p><p className="mt-1 font-display text-2xl">{v}</p></div>)}</div>
        <Panel title={`Sales by ${f.group}`}>
          {data.rows.length > 0 && <div className="h-64"><ResponsiveContainer><BarChart data={data.rows}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="key" fontSize={10} /><YAxis fontSize={10} /><Tooltip formatter={(v) => inr(v)} /><Bar dataKey="revenue" fill="#C5A059" animationDuration={1000} /></BarChart></ResponsiveContainer></div>}
          <div className="mt-4 overflow-x-auto"><table className="admin-table w-full"><thead><tr>{Object.keys(data.rows[0] || { key: 1 }).map((k) => <th key={k}>{k.replace("_", " ")}</th>)}</tr></thead><tbody>{data.rows.map((r) => <tr key={r.key}>{Object.entries(r).map(([k, v]) => <td key={k}>{typeof v === "number" && !["orders", "qty"].includes(k) ? inr(v) : v}</td>)}</tr>)}</tbody></table>
            {!data.rows.length && <p className="p-6 text-center text-sm text-stone-500">No sales in this period.</p>}</div>
        </Panel>
      </>}
      <CatalogueBuilder />
    </div>
  );
}
