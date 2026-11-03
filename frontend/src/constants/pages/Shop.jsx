import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { ProductCard } from "@/components/shop/ProductCard";
import { Empty, Skeleton } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";

function Filters({ data, params, set, cats, current }) {
  const kids = cats.filter((c) => c.parent_id === (current?.id || null));
  return (
    <div className="space-y-8 text-sm">
      <div><p className="eyebrow mb-3">Categories</p>
        {(current ? kids : cats.filter((c) => !c.parent_id)).map((c) => <Link key={c.id} to={`/category/${c.slug}`} className="block py-1 hover:text-[#8a6d33]">{c.name}</Link>)}
        {current && <Link to="/shop" className="mt-2 block text-xs text-stone-500">← All products</Link>}
      </div>
      {Object.entries(data?.facets || {}).map(([k, vals]) => (
        <div key={k}><p className="eyebrow mb-3">{k}</p>
          {vals.map((v) => {
            const on = params.get(`a_${k}`) === v;
            return <button key={v} data-testid={`filter-${k}-${v}`} onClick={() => set(`a_${k}`, on ? "" : v)} className={`mr-2 mb-2 border px-3 py-1 text-xs transition-colors ${on ? "border-[#1E2024] bg-[#1E2024] text-white" : "border-stone-300 hover:border-[#C5A059]"}`}>{v}</button>;
          })}
        </div>
      ))}
      <div><p className="eyebrow mb-3">Price (₹)</p>
        <div className="flex gap-2">
          <input data-testid="filter-min-price" className="field" placeholder="Min" defaultValue={params.get("min_price") || ""} onBlur={(e) => set("min_price", e.target.value)} />
          <input data-testid="filter-max-price" className="field" placeholder="Max" defaultValue={params.get("max_price") || ""} onBlur={(e) => set("max_price", e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2"><input data-testid="filter-in-stock" type="checkbox" checked={params.get("in_stock") === "true"} onChange={(e) => set("in_stock", e.target.checked ? "true" : "")} /> In stock only</label>
    </div>
  );
}

export default function Shop() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { site } = useApp();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const key = `${slug}|${params.toString()}`;
  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams(params);
    if (slug) qs.set("category", slug);
    qs.set("limit", "60");
    api.get(`/products?${qs}`).then((r) => setData(r.data)).catch(() => setData({ items: [], total: 0, error: true }));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p); };
  const title = data?.category?.name || (params.get("q") ? `Results for “${params.get("q")}”` : params.get("tag") === "new" ? "New arrivals" : params.get("tag") === "featured" ? "Featured" : "All products");
  useEffect(() => { document.title = `${title} | Seema Enterprise`; }, [title]);
  const cats = site?.categories || [];
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
      <p className="eyebrow">Catalogue</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
        <div><h1 className="font-display text-4xl font-semibold sm:text-5xl" data-testid="shop-title">{title}</h1>
          {data && <p className="mt-2 text-sm text-stone-500" data-testid="shop-count">{data.total} products</p>}</div>
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(true)} className="btn-line flex items-center gap-2 px-3 py-2 text-xs lg:hidden" data-testid="mobile-filters-btn"><SlidersHorizontal className="h-4 w-4" />Filters</button>
          <select data-testid="sort-select" className="field w-auto" value={params.get("sort") || "newest"} onChange={(e) => set("sort", e.target.value)}>
            <option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option>
          </select>
        </div>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block"><Filters data={data} params={params} set={set} cats={cats} current={data?.category} /></aside>
        <motion.div layout>
          {!data ? <div className="grid grid-cols-2 gap-5 md:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
            : data.items.length === 0 ? <Empty title="No products found" text={data.error ? "We couldn't load products. Please refresh." : "Try removing a filter or searching for a different term."} />
            : <div className="grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-3" data-testid="product-grid">{data.items.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div>}
        </motion.div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[65] bg-[#F9F8F6] p-6 overflow-y-auto" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30 }}>
            <div className="mb-6 flex justify-between"><p className="font-display text-2xl">Filters</p><button onClick={() => setOpen(false)}><X /></button></div>
            <Filters data={data} params={params} set={set} cats={cats} current={data?.category} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
