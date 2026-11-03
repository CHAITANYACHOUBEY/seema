import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Show, SignUpButton } from "@clerk/react";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import { Btn, Field, Reveal } from "@/components/kit";
import { BusinessForm } from "@/pages/Account";
import { useApp } from "@/lib/store";
import { API, api, errMsg, inr } from "@/lib/api";

const parseCsv = (text) => text.split(/\r?\n/).map((l) => l.split(/[,;\t]/)).filter((r) => r[0] && r[0].trim().toLowerCase() !== "sku").map((r) => ({ sku: r[0].trim(), qty: Number(r[1]) || 1 }));

export function QuickOrder() {
  const { setCart, setDrawer } = useApp();
  const [rows, setRows] = useState([{ sku: "", qty: 1, info: null }]);
  const lookup = async (i) => {
    const sku = rows[i].sku.trim(); if (!sku) return;
    try { const r = await api.get(`/products/by-sku/${encodeURIComponent(sku)}`); upd(i, { info: { name: r.data.product.name, price: r.data.variant.price, moq: r.data.product.moq } }); }
    catch { upd(i, { info: { error: "SKU not found" } }); }
  };
  const upd = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const send = async (items) => {
    try { const r = await api.post("/cart/bulk", { items }); setCart(r.data.cart); if (r.data.missing.length) toast.error(`Not found: ${r.data.missing.join(", ")}`); else toast.success("Added to cart"); setDrawer(true); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const onFile = async (e) => { const f = e.target.files[0]; if (f) send(parseCsv(await f.text())); e.target.value = ""; };
  return (
    <div className="border border-stone-200 bg-white p-6" data-testid="quick-order">
      <p className="font-display text-2xl">Quick order by SKU</p>
      <div className="mt-4 space-y-2">{rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_90px_auto] items-center gap-2 sm:grid-cols-[180px_90px_1fr_auto]">
          <input className="field" placeholder="SKU" data-testid={`quick-sku-${i}`} value={r.sku} onChange={(e) => upd(i, { sku: e.target.value, info: null })} onBlur={() => lookup(i)} />
          <input className="field" type="number" min="1" data-testid={`quick-qty-${i}`} value={r.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
          <p className="hidden text-xs sm:block">{r.info?.error ? <span className="text-red-600">{r.info.error}</span> : r.info ? `${r.info.name} · ${inr(r.info.price)}${r.info.moq > 1 ? ` · MOQ ${r.info.moq}` : ""}` : ""}</p>
          <button onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remove row"><Trash2 className="h-4 w-4 text-stone-400" /></button>
        </div>))}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn variant="line" onClick={() => setRows([...rows, { sku: "", qty: 1 }])} data-testid="quick-add-row"><Plus className="h-4 w-4" />Add row</Btn>
        <Btn onClick={() => send(rows.filter((r) => r.sku))} data-testid="quick-add-to-cart">Add all to cart</Btn>
        <label className="btn-line inline-flex cursor-pointer items-center gap-2 bg-white px-4 py-2 text-sm font-semibold"><Upload className="h-4 w-4" />Upload CSV (sku,qty)<input type="file" accept=".csv,.txt" hidden onChange={onFile} data-testid="quick-csv-input" /></label>
      </div>
    </div>
  );
}

export function Wholesale() {
  const { me } = useApp();
  return (
    <div>
      <section className="relative grain bg-[#1E2024] px-5 py-24 text-white lg:px-8"><div className="mx-auto max-w-7xl">
        <p className="eyebrow">Wholesale · Dealers · Distributors · Projects</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">Direct-from-manufacturer pricing for your business</h1>
        <p className="mt-5 max-w-xl text-stone-400">Approved business accounts see their contract price automatically, can order by SKU or spreadsheet, request formal quotations and download GST invoices.</p>
        <a href={`${API}/catalogue.pdf`} target="_blank" rel="noreferrer" className="btn-gold mt-8 inline-block px-6 py-3.5 text-xs font-bold uppercase tracking-[0.2em]" data-testid="wholesale-catalogue-btn">Download catalogue</a>
      </div></section>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-2 lg:px-8">
        <Reveal><p className="eyebrow">Apply</p><h2 className="mt-2 mb-6 font-display text-3xl">Business account</h2>
          <Show when="signed-in">{me ? <BusinessForm /> : null}</Show>
          <Show when="signed-out"><p className="mb-4 text-sm text-stone-600">Create an account first, then submit your business details for verification.</p><SignUpButton><button className="btn-dark px-6 py-3 text-sm font-semibold" data-testid="wholesale-signup-btn">Create account</button></SignUpButton></Show>
        </Reveal>
        <Reveal delay={0.1}><QuickOrder /><p className="mt-3 text-xs text-stone-500">Prices shown follow your account's price group. <Link to="/quote" className="underline">Need negotiated pricing? Request a quotation.</Link></p></Reveal>
      </div>
    </div>
  );
}

export function QuotePage() {
  const [sp] = useSearchParams();
  const { cart, me } = useApp();
  const init = sp.get("from") === "cart" ? (cart?.lines || []).map((l) => ({ sku: l.sku, qty: l.qty })) : sp.get("sku") ? [{ sku: sp.get("sku"), qty: Number(sp.get("qty")) || 1 }] : [{ sku: "", qty: 1 }];
  const [items, setItems] = useState(init);
  const [f, setF] = useState({ name: me?.customer?.name || "", email: me?.email || "", phone: me?.customer?.phone || "", company: me?.customer?.business_name || "", message: "" });
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post("/enquiries", { ...f, type: sp.get("type") === "bulk" ? "bulk" : "quote", items: items.filter((i) => i.sku) }); setDone(true); }
    catch (err) { toast.error(errMsg(err)); }
  };
  if (done) return <div className="mx-auto max-w-xl py-24 text-center" data-testid="quote-success"><p className="font-display text-4xl">Request received</p><p className="mt-3 text-stone-600">Our sales team will prepare your quotation and contact you shortly.</p><Link to="/shop" className="mt-6 inline-block underline">Continue browsing</Link></div>;
  const inp = (k, l, t = "text") => <Field label={l}><input required={k !== "company"} type={t} className="field" data-testid={`quote-${k}-input`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl px-5 py-14" data-testid="quote-form">
      <p className="eyebrow">Request for quotation</p><h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Tell us what you need</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">{inp("name", "Name")}{inp("company", "Company")}{inp("email", "Email", "email")}{inp("phone", "Phone")}</div>
      <p className="eyebrow mt-8 mb-3">Products</p>
      {items.map((it, i) => <div key={i} className="mb-2 grid grid-cols-[1fr_100px_auto] gap-2">
        <input className="field" placeholder="SKU or product name" data-testid={`quote-item-sku-${i}`} value={it.sku} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, sku: e.target.value } : x)))} />
        <input className="field" type="number" min="1" data-testid={`quote-item-qty-${i}`} value={it.qty} onChange={(e) => setItems(items.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} />
        <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-stone-400" /></button></div>)}
      <button type="button" onClick={() => setItems([...items, { sku: "", qty: 1 }])} className="text-xs font-semibold uppercase tracking-widest text-[#8a6d33]" data-testid="quote-add-item">+ Add product</button>
      <Field label="Details (delivery city, timeline, finish preferences)" className="mt-6"><textarea className="field min-h-[110px]" data-testid="quote-message-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      <Btn variant="gold" className="mt-6 px-8 py-3.5 uppercase tracking-[0.2em]" data-testid="quote-submit-btn">Send request</Btn>
    </form>
  );
}
