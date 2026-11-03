import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Trash2, Upload, X } from "lucide-react";
import { Badge, Btn, Field, PageHead, Skeleton, useLoad } from "@/components/kit";
import { Panel } from "@/pages/admin/AdminLayout";
import { useApp } from "@/lib/store";
import { api, downloadCsv, errMsg, img, inr } from "@/lib/api";

export function ProductList() {
  const { can, site } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const { data, reload } = useLoad(() => api.get(`/admin/products?q=${encodeURIComponent(q)}&status=${status}`).then((r) => r.data), [q, status]);
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const importCsv = async (e) => {
    const fd = new FormData(); fd.append("file", e.target.files[0]); e.target.value = "";
    act(async () => { const r = await api.post("/admin/products/import", fd); if (r.data.missing.length) toast.error(`Unknown SKUs: ${r.data.missing.join(", ")}`); }, "Import complete");
  };
  const cat = (id) => site?.categories.find((c) => c.id === id)?.name;
  return (
    <div>
      <PageHead title="Products" sub="Manage catalogue, variants, prices and publication.">
        <Btn variant="line" onClick={() => downloadCsv("/admin/products/export.csv", "products.csv")} data-testid="products-export-btn">Export CSV</Btn>
        {can("prices.edit") && <label className="btn-line inline-flex cursor-pointer items-center gap-2 bg-white px-4 py-2 text-sm font-semibold"><Upload className="h-4 w-4" />Bulk price/stock CSV<input hidden type="file" accept=".csv" onChange={importCsv} data-testid="products-import-input" /></label>}
        {can("products.edit") && <Btn onClick={() => nav("/admin/products/new")} data-testid="product-new-btn"><Plus className="h-4 w-4" />New product</Btn>}
      </PageHead>
      <div className="mb-4 flex gap-3"><input className="field max-w-xs" placeholder="Search name or SKU" data-testid="products-search" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="products-status-filter"><option value="">All</option><option value="active">Active</option><option value="archived">Archived</option></select></div>
      {!data ? <Skeleton className="h-64" /> : <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th /><th>Product</th><th>Category</th><th>SKUs</th><th>Retail from</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>
        {data.items.map((p) => <tr key={p.id} data-testid={`admin-product-row-${p.slug}`}>
          <td><img src={img(p.images?.[0])} alt="" className="h-10 w-10 object-cover" /></td>
          <td><Link to={`/admin/products/${p.id}`} className="font-semibold hover:text-[#8a6d33]">{p.name}</Link></td><td>{cat(p.category_id)}</td>
          <td className="text-xs">{p.variants.map((v) => v.sku).join(", ")}</td><td>{inr(Math.min(...p.variants.map((v) => v.retail)))}</td>
          <td>{p.variants.reduce((a, v) => a + (v.stock || 0), 0)}</td>
          <td className="space-x-1"><Badge status={p.status} />{p.is_published ? <Badge status="active">Live</Badge> : <Badge status="draft">Draft</Badge>}</td>
          <td className="whitespace-nowrap space-x-2">
            <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" title="Preview"><Eye className="inline h-4 w-4" /></a>
            {can("products.edit") && <>
              <button title="Duplicate" data-testid={`dup-${p.slug}`} onClick={() => act(() => api.post(`/admin/products/${p.id}/duplicate`), "Duplicated (as draft)")}><Copy className="inline h-4 w-4" /></button>
              <button className="text-xs underline" data-testid={`publish-${p.slug}`} onClick={() => act(() => api.post(`/admin/products/${p.id}/status`, { is_published: !p.is_published }), "Updated")}>{p.is_published ? "Unpublish" : "Publish"}</button>
              <button className="text-xs underline" data-testid={`archive-${p.slug}`} onClick={() => act(() => api.post(`/admin/products/${p.id}/status`, { status: p.status === "active" ? "archived" : "active" }), "Updated")}>{p.status === "active" ? "Archive" : "Restore"}</button></>}
          </td></tr>)}
      </tbody></table></div>}
    </div>
  );
}

const EMPTY_V = { sku: "", name: "", options: {}, mrp: 0, retail: 0, sale_price: null, sale_start: "", sale_end: "", wholesale: null, dealer: null, distributor: null, cost: 0, stock: 0, reorder_level: 10 };

export function ProductEditor() {
  const { id } = useParams();
  const isNew = id === "new";
  const { site, can } = useApp();
  const nav = useNavigate();
  const { data: p, setData: setP } = useLoad(() => isNew ? Promise.resolve({ name: "", category_id: site?.categories[0]?.id || "", description: "", images: [], documents: [], attributes: {}, specs: [], tags: [], hsn: "", gst_rate: 18, moq: 1, tiers: [], is_published: false, is_featured: false, is_new: true, seo_title: "", seo_description: "", variants: [{ ...EMPTY_V }] }) : api.get(`/admin/products/${id}`).then((r) => r.data), [id, site]);
  const [busy, setBusy] = useState(false);
  if (!p || !site) return <Skeleton className="h-96" />;
  const set = (k, v) => setP({ ...p, [k]: v });
  const cat = site.categories.find((c) => c.id === p.category_id);
  const upload = async (e, key) => {
    for (const f of e.target.files) {
      const fd = new FormData(); fd.append("file", f);
      try { const r = await api.post("/admin/upload", fd); setP((cur) => ({ ...cur, [key]: [...cur[key], key === "images" ? r.data.url : { name: r.data.name, url: r.data.url }] })); } catch (err) { toast.error(errMsg(err)); }
    }
    e.target.value = "";
  };
  const move = (i, d) => { const a = [...p.images]; [a[i], a[i + d]] = [a[i + d], a[i]]; set("images", a); };
  const setV = (i, k, v) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const num = (v) => (v === "" || v === null ? null : Number(v));
  const save = async () => {
    setBusy(true);
    const body = { ...p, variants: p.variants.map((v) => ({ ...v, mrp: num(v.mrp) || 0, retail: num(v.retail) || 0, cost: num(v.cost) || 0, stock: parseInt(v.stock) || 0, reorder_level: parseInt(v.reorder_level) || 0, sale_price: num(v.sale_price), wholesale: num(v.wholesale), dealer: num(v.dealer), distributor: num(v.distributor) })) };
    try { const r = isNew ? await api.post("/admin/products", body) : await api.put(`/admin/products/${id}`, body); toast.success("Product saved"); if (isNew) nav(`/admin/products/${r.data.id}`); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const priceCols = [["mrp", "MRP"], ["retail", "Retail"], ["sale_price", "Offer"], ["wholesale", "Wholesale"], ["dealer", "Dealer"], ["distributor", "Distrib."], ["cost", "Cost"]];
  return (
    <div className="pb-24">
      <PageHead title={isNew ? "New product" : p.name} sub={isNew ? "" : `/product/${p.slug}`}>{!isNew && <a href={`/product/${p.slug}`} target="_blank" rel="noreferrer" className="btn-line bg-white px-4 py-2 text-sm font-semibold">Preview</a>}</PageHead>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Basics" className="xl:col-span-2"><div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><input className="field" data-testid="pe-name" value={p.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Category"><select className="field" data-testid="pe-category" value={p.category_id} onChange={(e) => set("category_id", e.target.value)}>{site.categories.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>)}</select></Field>
          <Field label="Tags (comma separated)"><input className="field" value={p.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /></Field>
          <Field label="Description" className="sm:col-span-2"><textarea className="field min-h-[120px]" data-testid="pe-description" value={p.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label="HSN code"><input className="field" data-testid="pe-hsn" value={p.hsn} onChange={(e) => set("hsn", e.target.value)} /></Field>
          <Field label="GST rate %"><select className="field" data-testid="pe-gst" value={p.gst_rate} onChange={(e) => set("gst_rate", Number(e.target.value))}>{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}</select></Field>
          <Field label="Minimum order qty"><input type="number" min="1" className="field" data-testid="pe-moq" value={p.moq} onChange={(e) => set("moq", parseInt(e.target.value) || 1)} /></Field>
          <div className="flex flex-wrap items-end gap-4 text-sm">{[["is_published", "Published"], ["is_featured", "Featured"], ["is_new", "New arrival"]].map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" data-testid={`pe-${k}`} checked={!!p[k]} onChange={(e) => set(k, e.target.checked)} />{l}</label>)}</div>
        </div></Panel>
        <Panel title="Images & documents">
          <div className="grid grid-cols-3 gap-2">{p.images.map((u, i) => <div key={u + i} className="group relative"><img src={img(u)} alt="" className="aspect-square w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <button disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></button><button disabled={i === p.images.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></button><button onClick={() => set("images", p.images.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></div></div>)}</div>
          <label className="btn-line mt-3 flex cursor-pointer items-center justify-center gap-2 py-2 text-sm"><Upload className="h-4 w-4" />Upload images<input hidden multiple type="file" accept="image/*" data-testid="pe-image-upload" onChange={(e) => upload(e, "images")} /></label>
          <div className="mt-4 space-y-1 text-sm">{p.documents.map((d, i) => <div key={i} className="flex justify-between"><a href={img(d.url)} target="_blank" rel="noreferrer" className="underline">{d.name}</a><button onClick={() => set("documents", p.documents.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button></div>)}</div>
          <label className="btn-line mt-2 flex cursor-pointer items-center justify-center gap-2 py-2 text-sm"><Upload className="h-4 w-4" />Upload PDF / spec sheet<input hidden type="file" accept="application/pdf" onChange={(e) => upload(e, "documents")} /></label>
        </Panel>
        <Panel title={`Attributes${cat ? ` — defined by ${cat.name}` : ""}`}>
          {(cat?.attributes || []).map((a) => <Field key={a.key} label={a.key} className="mb-3">{a.type === "select" ? <select className="field" value={p.attributes[a.key] || ""} onChange={(e) => set("attributes", { ...p.attributes, [a.key]: e.target.value })}><option value="">—</option>{a.options.map((o) => <option key={o}>{o}</option>)}</select>
            : <input className="field" value={p.attributes[a.key] || ""} onChange={(e) => set("attributes", { ...p.attributes, [a.key]: e.target.value })} />}</Field>)}
          {!cat?.attributes?.length && <p className="text-sm text-stone-500">Add attribute definitions to this category under Categories.</p>}
        </Panel>
        <Panel title="Technical specifications" action={<button className="text-xs underline" onClick={() => set("specs", [...p.specs, { label: "", value: "" }])} data-testid="pe-add-spec">+ Add</button>}>
          {p.specs.map((s, i) => <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] gap-2"><input className="field" placeholder="Label" value={s.label} onChange={(e) => set("specs", p.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /><input className="field" placeholder="Value" value={s.value} onChange={(e) => set("specs", p.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} /><button onClick={() => set("specs", p.specs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>)}
        </Panel>
        <Panel title="Quantity price tiers (on retail)" action={<button className="text-xs underline" onClick={() => set("tiers", [...p.tiers, { min_qty: 10, discount_pct: 5 }])} data-testid="pe-add-tier">+ Add</button>}>
          {p.tiers.map((t, i) => <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-center gap-2"><Field label="Min qty"><input type="number" className="field" value={t.min_qty} onChange={(e) => set("tiers", p.tiers.map((x, j) => (j === i ? { ...x, min_qty: Number(e.target.value) } : x)))} /></Field><Field label="Discount %"><input type="number" className="field" value={t.discount_pct} onChange={(e) => set("tiers", p.tiers.map((x, j) => (j === i ? { ...x, discount_pct: Number(e.target.value) } : x)))} /></Field><button onClick={() => set("tiers", p.tiers.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></div>)}
        </Panel>
        <Panel title="Variants, prices (excl. GST) & stock" className="xl:col-span-3" action={<button className="text-xs underline" data-testid="pe-add-variant" onClick={() => set("variants", [...p.variants, { ...EMPTY_V, _new: true }])}>+ Add variant</button>}>
          {!can("prices.edit") && <p className="mb-2 text-xs text-amber-700">You can view prices but not change them.</p>}
          <div className="overflow-x-auto"><table className="admin-table w-full"><thead><tr><th>SKU</th><th>Variant name</th>{priceCols.map(([, l]) => <th key={l}>{l}</th>)}<th>Offer from</th><th>Offer to</th><th>{isNew ? "Opening stock" : "Stock"}</th><th>Reorder at</th><th /></tr></thead><tbody>
            {p.variants.map((v, i) => <tr key={i}>
              <td><input className="field w-32" data-testid={`pe-v${i}-sku`} value={v.sku} onChange={(e) => setV(i, "sku", e.target.value)} /></td>
              <td><input className="field w-32" data-testid={`pe-v${i}-name`} value={v.name} onChange={(e) => setV(i, "name", e.target.value)} /></td>
              {priceCols.map(([k]) => <td key={k}><input type="number" className="field w-24" data-testid={`pe-v${i}-${k}`} disabled={!can("prices.edit") && !isNew} value={v[k] ?? ""} onChange={(e) => setV(i, k, e.target.value)} /></td>)}
              <td><input type="date" className="field w-36" value={v.sale_start || ""} onChange={(e) => setV(i, "sale_start", e.target.value)} /></td>
              <td><input type="date" className="field w-36" value={v.sale_end || ""} onChange={(e) => setV(i, "sale_end", e.target.value)} /></td>
              <td>{isNew || v._new ? <input type="number" className="field w-20" data-testid={`pe-v${i}-stock`} value={v.stock} onChange={(e) => setV(i, "stock", e.target.value)} /> : <span title="Change stock in Inventory">{v.stock}</span>}</td>
              <td><input type="number" className="field w-20" value={v.reorder_level ?? 10} onChange={(e) => setV(i, "reorder_level", e.target.value)} /></td>
              <td><button onClick={() => set("variants", p.variants.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></td></tr>)}
          </tbody></table></div>
          <p className="mt-2 text-xs text-stone-500">Existing stock is changed only via Inventory so every movement is recorded in the ledger.</p>
        </Panel>
        <Panel title="SEO" className="xl:col-span-2"><div className="grid gap-3 sm:grid-cols-2"><Field label="SEO title"><input className="field" value={p.seo_title} onChange={(e) => set("seo_title", e.target.value)} /></Field><Field label="Meta description"><input className="field" value={p.seo_description} onChange={(e) => set("seo_description", e.target.value)} /></Field></div></Panel>
        {p.price_history?.length > 0 && <Panel title="Price history"><div className="max-h-56 overflow-y-auto text-xs">{p.price_history.map((h) => <p key={h.id} className="border-b border-stone-100 py-1">{h.at.slice(0, 10)} · {h.sku} · {h.field}: {h.old ?? "—"} → {h.new} <span className="text-stone-400">({h.by})</span></p>)}</div></Panel>}
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-end gap-3 border-t border-stone-200 bg-white/90 px-8 py-3 backdrop-blur lg:left-[240px]">
        <Btn variant="line" onClick={() => nav("/admin/products")}>Back</Btn><Btn variant="gold" disabled={busy} onClick={save} data-testid="pe-save-btn">{busy ? "Saving…" : "Save product"}</Btn>
      </div>
    </div>
  );
}
