import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Minus, Plus, MessageCircle, Heart } from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/shop/ProductCard";
import { waLink } from "@/components/shop/Footer";
import { Empty, Skeleton } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api, errMsg, img, inr, ruleLabel } from "@/lib/api";

function Gallery({ images, name }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(null);
  const list = images?.length ? images : [""];
  return (
    <div className="flex flex-col-reverse gap-4 md:flex-row">
      <div className="flex gap-3 md:flex-col">
        {list.map((u, k) => <button key={k} data-testid={`gallery-thumb-${k}`} onClick={() => setI(k)} className={`h-20 w-20 overflow-hidden border-2 ${k === i ? "border-[#C5A059]" : "border-transparent"}`}><img src={img(u)} alt="" className="h-full w-full object-cover" /></button>)}
      </div>
      <div className="relative aspect-square flex-1 cursor-zoom-in overflow-hidden bg-[#ECEAE5]" data-testid="gallery-main"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }}
        onMouseLeave={() => setZoom(null)}>
        <AnimatePresence mode="wait">
          <motion.img key={i} src={img(list[i])} alt={name} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}
            style={zoom ? { transformOrigin: zoom, transform: "scale(1.8)" } : undefined} className="h-full w-full object-cover transition-transform duration-200" />
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const { addToCart, site, isSignedIn, me } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setD(null);
    api.get(`/products/${slug}`).then((r) => { setD(r.data); setSku(r.data.product.variants[0]?.sku); setQty(r.data.product.moq || 1); document.title = `${r.data.product.seo_title || r.data.product.name} | Seema Enterprise`; })
      .catch(() => setD({ notFound: true }));
  }, [slug, me?.role]);
  useEffect(() => { if (isSignedIn && d?.product) api.get("/wishlist").then((r) => setSaved(r.data.product_ids.includes(d.product.id))).catch(() => {}); }, [isSignedIn, d]);
  if (!d) return <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-2"><Skeleton className="aspect-square" /><Skeleton className="h-96" /></div>;
  if (d.notFound) return <div className="mx-auto max-w-3xl py-20"><Empty title="Product not found" action={<Link to="/shop" className="underline">Back to shop</Link>} /></div>;
  const p = d.product;
  const v = p.variants.find((x) => x.sku === sku) || p.variants[0];
  const moq = p.moq || 1;
  const tier = [...(p.tiers || [])].sort((a, b) => b.min_qty - a.min_qty).find((t) => qty >= t.min_qty);
  const unit = v.rule === "standard" || v.rule === "promotion" ? (tier ? v.retail * (1 - tier.discount_pct / 100) : v.price) : v.price;
  const wa = waLink(site?.company?.whatsapp, `Hello, I'm interested in ${p.name} (SKU ${v.sku}), quantity ${qty}.`);
  const toggleSave = async () => {
    if (!isSignedIn) return nav("/sign-in");
    try { const r = await api.post(`/wishlist/${p.id}`); setSaved(r.data.saved); toast.success(r.data.saved ? "Saved to wishlist" : "Removed from wishlist"); } catch (e) { toast.error(errMsg(e)); }
  };
  const ld = { "@context": "https://schema.org", "@type": "Product", name: p.name, sku: v.sku, image: p.images, description: p.description,
    offers: { "@type": "Offer", priceCurrency: "INR", price: v.price, availability: v.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } };
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <script type="application/ld+json">{JSON.stringify(ld)}</script>
      <nav className="mb-6 text-xs uppercase tracking-[0.16em] text-stone-500"><Link to="/shop">Shop</Link> / {d.category && <Link to={`/category/${d.category.slug}`}>{d.category.name}</Link>}</nav>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7"><Gallery images={p.images} name={p.name} /></div>
        <div className="lg:col-span-5">
          <p className="text-xs uppercase tracking-[0.2em] text-stone-500" data-testid="product-sku">SKU {v.sku}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl" data-testid="product-name">{p.name}</h1>
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-bold" data-testid="product-price">{inr(unit)}</span>
            {v.mrp > unit && <span className="text-sm text-stone-400 line-through">MRP {inr(v.mrp)}</span>}
            <span className="text-xs text-stone-500">{site?.commerce?.prices_include_tax ? "incl. GST" : `+ ${p.gst_rate}% GST`}</span>
          </div>
          {(ruleLabel(v.rule) || tier) && <p className="mt-2 inline-block bg-[#C5A059]/15 px-2 py-1 text-xs font-semibold text-[#8a6d33]" data-testid="price-rule">{tier && (v.rule === "standard" || v.rule === "promotion") ? `Bulk price: ${tier.discount_pct}% off for ${tier.min_qty}+` : ruleLabel(v.rule)}</p>}
          {p.variants.length > 1 && (
            <div className="mt-7"><p className="eyebrow mb-3">Option</p><div className="flex flex-wrap gap-2">
              {p.variants.map((x) => <button key={x.sku} data-testid={`variant-${x.sku}`} onClick={() => setSku(x.sku)} className={`border px-4 py-2 text-sm transition-colors ${x.sku === v.sku ? "border-[#1E2024] bg-[#1E2024] text-white" : "border-stone-300 hover:border-[#C5A059]"} ${!x.in_stock ? "opacity-50" : ""}`}>{x.name || x.sku}</button>)}
            </div></div>
          )}
          {p.tiers?.length > 0 && (
            <div className="mt-7 border border-stone-200 bg-white" data-testid="tier-table"><p className="eyebrow border-b border-stone-200 px-4 py-2">Quantity pricing</p>
              {p.tiers.map((t) => <div key={t.min_qty} className="flex justify-between px-4 py-2 text-sm"><span>{t.min_qty}+ units</span><span className="font-semibold">{t.discount_pct}% off retail</span></div>)}
              <p className="px-4 pb-2 text-[11px] text-stone-500">Approved business accounts see their own price group instead.</p>
            </div>
          )}
          <div className="mt-7 flex items-center gap-4">
            <div className="flex items-center border border-stone-300 bg-white">
              <button data-testid="qty-dec" aria-label="Decrease" className="p-3" onClick={() => setQty(Math.max(moq, qty - 1))}><Minus className="h-4 w-4" /></button>
              <input data-testid="qty-input" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-14 text-center outline-none" />
              <button data-testid="qty-inc" aria-label="Increase" className="p-3" onClick={() => setQty(qty + 1)}><Plus className="h-4 w-4" /></button>
            </div>
            <div className="text-xs text-stone-500"><p data-testid="stock-status" className={v.in_stock ? "text-emerald-700" : "text-red-600"}>{v.in_stock ? `In stock (${v.stock})` : "Out of stock"}</p>{moq > 1 && <p>Minimum order: {moq}</p>}</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button data-testid="add-to-cart-btn" disabled={!v.in_stock || qty < moq} onClick={() => addToCart(v.sku, qty)} className="btn-dark py-4 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-40">Add to cart</button>
            <button data-testid="buy-now-btn" disabled={!v.in_stock || qty < moq} onClick={async () => { if (await addToCart(v.sku, qty, false)) nav("/checkout"); }} className="btn-gold py-4 text-xs font-bold uppercase tracking-[0.2em] disabled:opacity-40">Buy now</button>
            <Link to={`/quote?sku=${v.sku}&qty=${qty}`} data-testid="request-quote-btn" className="btn-line py-3 text-center text-xs font-semibold uppercase tracking-[0.16em]">Request quotation</Link>
            {wa ? <a href={wa} target="_blank" rel="noreferrer" data-testid="whatsapp-enquiry-btn" className="btn-line flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-[0.16em]"><MessageCircle className="h-4 w-4" />WhatsApp</a>
              : <Link to={`/quote?sku=${v.sku}&qty=${qty}&type=bulk`} data-testid="bulk-enquiry-btn" className="btn-line py-3 text-center text-xs font-semibold uppercase tracking-[0.16em]">Bulk enquiry</Link>}
          </div>
          <button onClick={toggleSave} data-testid="wishlist-toggle-btn" className="mt-4 flex items-center gap-2 text-xs uppercase tracking-widest text-stone-600 hover:text-[#8a6d33]"><Heart className={`h-4 w-4 ${saved ? "fill-[#C5A059] text-[#C5A059]" : ""}`} />{saved ? "Saved" : "Save to wishlist"}</button>
          <p className="mt-6 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">Shipping: {site?.commerce?.free_shipping_above ? `free above ${inr(site.commerce.free_shipping_above)}, otherwise ${inr(site.commerce.shipping_flat)}` : "calculated at checkout"}. Dispatch details are shared after order confirmation.</p>
        </div>
      </div>
      <div className="mt-16 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7"><p className="eyebrow">Description</p><p className="mt-3 whitespace-pre-line leading-relaxed text-stone-700">{p.description}</p>
          {p.documents?.length > 0 && <div className="mt-6"><p className="eyebrow mb-2">Documents</p>{p.documents.map((doc, i) => <a key={i} href={img(doc.url)} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 text-sm text-[#8a6d33]"><FileText className="h-4 w-4" />{doc.name}</a>)}</div>}
        </div>
        <div className="lg:col-span-5"><p className="eyebrow">Specifications</p>
          <table className="mt-3 w-full text-sm" data-testid="spec-table"><tbody>
            {[...Object.entries(p.attributes || {}).map(([k, val]) => ({ label: k, value: val })), ...(p.specs || []), { label: "HSN", value: p.hsn }, { label: "GST", value: `${p.gst_rate}%` }].filter((s) => s.value).map((s, i) => (
              <tr key={i} className="border-b border-stone-200"><td className="py-2.5 pr-4 text-stone-500">{s.label}</td><td className="py-2.5 font-medium">{s.value}</td></tr>))}
          </tbody></table>
        </div>
      </div>
      {d.related.length > 0 && <div className="mt-20"><h2 className="font-display text-3xl">Related products</h2><div className="mt-8 grid grid-cols-2 gap-5 md:grid-cols-4">{d.related.map((r, i) => <ProductCard key={r.id} p={r} i={i} />)}</div></div>}
    </div>
  );
}
