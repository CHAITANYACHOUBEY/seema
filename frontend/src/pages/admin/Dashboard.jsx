import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { Panel } from "@/pages/admin/AdminLayout";
import { api, inr } from "@/lib/api";

const Kpi = ({ label, value, to, testid }) => (
  <Link to={to || "#"} data-testid={testid} className="group border border-stone-200 bg-white p-5 transition-transform hover:-translate-y-0.5">
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
    <p className="mt-2 font-display text-3xl font-semibold group-hover:text-[#8a6d33]">{value}</p>
  </Link>
);

export default function Dashboard() {
  const [range, setRange] = useState({ frm: "", to: "" });
  const { data: d } = useLoad(() => api.get(`/admin/dashboard?frm=${range.frm}&to=${range.to}`).then((r) => r.data), [range.frm, range.to]);
  return (
    <div>
      <PageHead title="Dashboard" sub="All figures come from live order, invoice and stock records.">
        <Field label="From"><input type="date" className="field" data-testid="dash-from" value={range.frm} onChange={(e) => setRange({ ...range, frm: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="field" data-testid="dash-to" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
      </PageHead>
      {!d ? <Skeleton className="h-96" /> : <>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Revenue (orders)" value={inr(d.kpis.revenue)} testid="kpi-revenue" to="/admin/reports" />
          <Kpi label="Collected payments" value={inr(d.kpis.collected)} testid="kpi-collected" to="/admin/invoices" />
          <Kpi label="Outstanding receivables" value={inr(d.kpis.outstanding)} testid="kpi-outstanding" to="/admin/invoices" />
          <Kpi label="Orders" value={d.kpis.total_orders} testid="kpi-orders" to="/admin/orders" />
          <Kpi label="Today's orders" value={d.kpis.today_orders} testid="kpi-today" to="/admin/orders" />
          <Kpi label="Awaiting processing" value={d.kpis.awaiting_processing} testid="kpi-processing" to="/admin/orders" />
          <Kpi label="Pending quotations" value={d.kpis.pending_quotations} testid="kpi-quotes" to="/admin/quotations" />
          <Kpi label="Business approvals" value={d.kpis.pending_approvals} testid="kpi-approvals" to="/admin/customers?status=pending" />
          <Kpi label="New customers (30d)" value={d.kpis.new_customers} testid="kpi-customers" to="/admin/customers" />
          <Kpi label="Low-stock items" value={d.kpis.low_stock} testid="kpi-low-stock" to="/admin/inventory" />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Panel title="Monthly sales — retail vs wholesale" className="xl:col-span-2">
            <div className="h-72"><ResponsiveContainer><AreaChart data={d.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => inr(v)} />
              <Area type="monotone" dataKey="retail" stackId="1" stroke="#1E2024" fill="#1E2024" fillOpacity={0.7} animationDuration={1200} />
              <Area type="monotone" dataKey="wholesale" stackId="1" stroke="#C5A059" fill="#C5A059" fillOpacity={0.7} animationDuration={1400} /></AreaChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="Channel split">
            {d.channels.length ? <div className="h-72"><ResponsiveContainer><PieChart><Pie data={d.channels} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} animationDuration={1200}>{d.channels.map((_, i) => <Cell key={i} fill={["#1E2024", "#C5A059"][i % 2]} />)}</Pie><Tooltip formatter={(v) => inr(v)} /></PieChart></ResponsiveContainer></div> : <p className="text-sm text-stone-500">No sales in this period yet.</p>}
          </Panel>
          <Panel title="Top products">{d.top_products.length ? d.top_products.map((t) => <div key={t.sku} className="flex justify-between border-b border-stone-100 py-2 text-sm"><span>{t.name}<span className="ml-2 text-xs text-stone-400">{t.qty} units</span></span><span>{inr(t.revenue)}</span></div>) : <p className="text-sm text-stone-500">No sales yet.</p>}</Panel>
          <Panel title="Low stock">{d.low_stock.length ? d.low_stock.map((l) => <div key={l.sku} className="flex justify-between border-b border-stone-100 py-2 text-sm"><span>{l.name} <span className="text-xs text-stone-400">{l.sku}</span></span><span className="font-semibold text-red-600">{l.stock}</span></div>) : <p className="text-sm text-stone-500">All stock above reorder levels.</p>}</Panel>
          <Panel title="Recent enquiries">{d.recent_enquiries.length ? d.recent_enquiries.map((e) => <div key={e.id} className="flex items-center justify-between border-b border-stone-100 py-2 text-sm"><span>{e.name} <span className="text-xs text-stone-400">{e.type}</span></span><Badge status={e.status} /></div>) : <p className="text-sm text-stone-500">No enquiries yet.</p>}</Panel>
          <Panel title="Recent activity" className="xl:col-span-3">{d.recent_activity.map((a) => <p key={a.id} className="border-b border-stone-100 py-1.5 text-xs"><span className="text-stone-400">{a.at.slice(0, 16).replace("T", " ")}</span> · {a.user_email} · <b>{a.action}</b> {a.entity}</p>)}</Panel>
        </div>
      </>}
    </div>
  );
}
