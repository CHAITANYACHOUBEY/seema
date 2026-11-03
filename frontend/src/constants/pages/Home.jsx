import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform, animate } from "framer-motion";
import { ArrowRight, Building2, FileDown, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductCard } from "@/components/shop/ProductCard";
import { Reveal, Skeleton } from "@/components/kit";
import { useApp } from "@/lib/store";
import { API, api, errMsg, img } from "@/lib/api";

const Counter = ({ to, label }) => {
  const [n, setN] = useState(0);
  useEffect(() => { const c = animate(0, to, { duration: 1.6, onUpdate: (v) => setN(Math.round(v)) }); return () => c.stop(); }, [to]);
  return <div><p className="font-display text-4xl text-white sm:text-5xl">{n}</p><p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-stone-400">{label}</p></div>;
};

function Hero({ site, stats }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, reduce ? 0 : 120]);
  const h = site?.content?.hero || {};
  return (
    <section className="relative grain overflow-hidden bg-[#1E2024]" data-testid="home-hero">
      <motion.img style={{ y }} src={img(h.image)} alt="" className="absolute inset-0 h-[115%] w-full object-cover opacity-45"
        initial={reduce ? false : { scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 2.2, ease: "easeOut" }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#1E2024] via-[#1E2024]/80 to-transparent" />
      <div className="relative mx-auto grid min-h-[78vh] max-w-7xl items-end gap-10 px-5 pb-16 pt-28 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-8">
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="eyebrow">{h.eyebrow}</motion.p>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.02] text-white sm:text-5xl lg:text-7xl">{h.title}</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-6 max-w-xl text-base leading-relaxed text-stone-300">{h.subtitle}</motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="mt-9 flex flex-wrap gap-3">
            <Link to="/shop" data-testid="hero-shop-btn" className="btn-gold inline-flex items-center gap-2 px-7 py-4 text-xs font-bold uppercase tracking-[0.22em]">Shop retail <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/wholesale" data-testid="hero-wholesale-btn" className="inline-flex items-center gap-2 border border-white/30 px-7 py-4 text-xs font-bold uppercase tracking-[0.22em] text-white transition-colors hover:border-[#C5A059] hover:text-[#C5A059]">Wholesale & dealers</Link>
          </motion.div>
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-white/15 pt-6 lg:col-span-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" data-testid="hero-stats">
          <Counter to={stats.products} label="Products" />
          <Counter to={stats.skus} label="SKUs" />
          <Counter to={stats.categories} label="Categories" />
        </div>
      </div>
    </section>
  );
}

const Row = ({ title, eyebrow, items, link, testid }) => (
  <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8" data-testid={testid}>
    <Reveal className="mb-10 flex items-end justify-between">
      <div><p className="eyebrow">{eyebrow}</p><h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{title}</h2></div>
      <Link to={link} className="text-xs font-semibold uppercase tracking-[0.2em] hover:text-[#8a6d33]">View all →</Link>
    </Reveal>
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4">
      {items ? items.slice(0, 4).map((p, i) => <ProductCard key={p.id} p={p} i={i} />) : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}
    </div>
  </section>
);

function BulkEnquiry() {
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/enquiries", { ...f, type: "bulk" }); toast.success("Thank you — our sales team will contact you."); setF({ name: "", email: "", phone: "", company: "", message: "" }); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const inp = (k, ph, type = "text") => <input data-testid={`bulk-${k}-input`} required={k !== "company"} type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full border-b border-white/25 bg-transparent py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#C5A059]" />;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="bulk-enquiry-form">
      {inp("name", "Your name")}{inp("company", "Company / firm")}{inp("email", "Email", "email")}{inp("phone", "Phone")}
      <textarea data-testid="bulk-message-input" required placeholder="Products, quantities and delivery city" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="min-h-[90px] border-b border-white/25 bg-transparent py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#C5A059] sm:col-span-2" />
      <button disabled={busy} data-testid="bulk-submit-btn" className="btn-gold px-6 py-3.5 text-xs font-bold uppercase tracking-[0.2em] sm:w-fit">Send bulk enquiry</button>
    </form>
  );
}

export default function Home() {
  const { site } = useApp();
  const [newItems, setNew] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [stats, setStats] = useState({ products: 0, skus: 0, categories: 0 });
  useEffect(() => {
    api.get("/products?tag=new&limit=8").then((r) => setNew(r.data.items));
    api.get("/products?tag=featured&limit=8").then((r) => setFeatured(r.data.items));
    api.get("/products?limit=500").then((r) => setStats((s) => ({ ...s, products: r.data.total, skus: r.data.items.reduce((a, p) => a + p.variants.length, 0) })));
  }, []);
  useEffect(() => { if (site) setStats((s) => ({ ...s, categories: site.categories.length })); }, [site]);
  useEffect(() => { document.title = site?.content?.seo?.title || "Seema Enterprise"; }, [site]);
  const roots = (site?.categories || []).filter((c) => !c.parent_id);
  const ct = site?.content || {};
  return (
    <div>
      <Hero site={site} stats={stats} />
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8" data-testid="collections-section">
        <Reveal><p className="eyebrow">Collections</p><h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Shop by category</h2></Reveal>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-12">
          {roots.map((c, i) => (
            <Reveal key={c.id} delay={i * 0.08} className={i === 0 ? "md:col-span-7 md:row-span-3" : "md:col-span-5"}>
              <Link to={`/category/${c.slug}`} data-testid={`collection-${c.slug}`} className="group relative block h-full min-h-[220px] overflow-hidden bg-stone-300">
                <img src={img(c.image)} alt={c.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E2024]/85 via-transparent" />
                <div className="absolute bottom-0 p-6"><p className="font-display text-3xl text-white">{c.name}</p><p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#C5A059] transition-transform group-hover:translate-x-1">Explore →</p></div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <Row title="New arrivals" eyebrow="Just in" items={newItems} link="/shop?tag=new" testid="new-arrivals-section" />
      <section className="brushed">
        <div className="mx-auto grid max-w-7xl gap-px px-5 py-16 md:grid-cols-2 lg:px-8">
          {[{ t: "Retail customers", d: "Buy individual pieces with secure online payment, GST invoices and doorstep delivery.", to: "/shop", c: "Start shopping", icon: Truck },
            { t: "Wholesale, dealers & projects", d: "Apply for a business account to unlock your price group, quick ordering by SKU and quotations.", to: "/wholesale", c: "Open a business account", icon: Building2 }].map((x, i) => (
            <Reveal key={x.t} delay={i * 0.1} className="bg-[#F9F8F6]/90 p-10">
              <x.icon className="h-6 w-6 text-[#C5A059]" />
              <h3 className="mt-5 font-display text-3xl">{x.t}</h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-600">{x.d}</p>
              <Link to={x.to} className="mt-6 inline-block text-xs font-bold uppercase tracking-[0.2em] text-[#8a6d33] hover:text-[#16171A]">{x.c} →</Link>
            </Reveal>
          ))}
        </div>
      </section>
      <Row title="Best sellers & featured" eyebrow="Curated" items={featured} link="/shop?tag=featured" testid="featured-section" />
      {(ct.banners || []).map((b, i) => (
        <Reveal key={i} className="mx-auto max-w-7xl px-5 lg:px-8">
          <Link to={b.link || "/shop"} className="group relative block overflow-hidden" data-testid={`promo-banner-${i}`}>
            <img src={img(b.image)} alt={b.title} className="h-72 w-full object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
            <div className="absolute inset-0 flex flex-col justify-center bg-[#1E2024]/60 p-10"><h3 className="max-w-lg font-display text-4xl text-white">{b.title}</h3><p className="mt-2 max-w-md text-sm text-stone-300">{b.text}</p></div>
          </Link>
        </Reveal>
      ))}
      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-24 lg:grid-cols-12 lg:px-8">
        <Reveal className="lg:col-span-5"><p className="eyebrow">About us</p><h2 className="mt-2 font-display text-4xl font-semibold">{site?.company?.name}</h2>
          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-stone-600">{(ct.pages?.about || "").slice(0, 500)}</p>
          <Link to="/about" className="mt-6 inline-block text-xs font-bold uppercase tracking-[0.2em] text-[#8a6d33]">Read more →</Link></Reveal>
        <Reveal delay={0.1} className="lg:col-span-7"><div className="grid gap-px bg-stone-200 sm:grid-cols-2">
          {[{ icon: ShieldCheck, t: "Quality & manufacturing", d: (ct.pages?.quality || "").slice(0, 160), to: "/quality" }, { icon: FileDown, t: "Download catalogue", d: "Get the latest product catalogue as a PDF with current retail prices.", href: `${API}/catalogue.pdf` }].map((x) => (
            <div key={x.t} className="bg-[#F9F8F6] p-8"><x.icon className="h-6 w-6 text-[#C5A059]" /><p className="mt-4 font-display text-2xl">{x.t}</p><p className="mt-2 text-sm text-stone-600">{x.d}</p>
              {x.href ? <a href={x.href} target="_blank" rel="noreferrer" data-testid="home-catalogue-download" className="mt-4 inline-block text-xs font-bold uppercase tracking-[0.2em] text-[#8a6d33]">Download PDF →</a> : <Link to={x.to} className="mt-4 inline-block text-xs font-bold uppercase tracking-[0.2em] text-[#8a6d33]">Learn more →</Link>}
            </div>))}
        </div></Reveal>
      </section>
      {ct.testimonials?.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8"><p className="eyebrow">Testimonials</p>
          <div className="mt-6 grid gap-6 md:grid-cols-3">{ct.testimonials.map((t, i) => <Reveal key={i} delay={i * 0.08} className="border-l-2 border-[#C5A059] bg-white p-6"><p className="font-display text-xl leading-snug">“{t.quote}”</p><p className="mt-4 text-xs uppercase tracking-widest text-stone-500">{t.name}{t.company ? `, ${t.company}` : ""}</p></Reveal>)}</div>
        </section>
      )}
      <section className="relative grain bg-[#1E2024]">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-5"><p className="eyebrow">Bulk & project orders</p><h2 className="mt-2 font-display text-4xl text-white">Tell us what you need. We'll quote fast.</h2>
            <p className="mt-4 text-sm text-stone-400">Builders, contractors, interior designers and retailers — share your requirement and our team will respond with pricing and dispatch timelines.</p></div>
          <div className="lg:col-span-7"><BulkEnquiry /></div>
        </div>
      </section>
      {ct.faqs?.length > 0 && (
        <section className="mx-auto max-w-3xl px-5 py-20" data-testid="home-faq"><p className="eyebrow text-center">FAQ</p><h2 className="mt-2 text-center font-display text-4xl">Frequently asked</h2>
          <Accordion type="single" collapsible className="mt-8">{ct.faqs.map((f, i) => <AccordionItem key={i} value={`f${i}`}><AccordionTrigger data-testid={`faq-trigger-${i}`} className="text-left text-base">{f.q}</AccordionTrigger><AccordionContent className="text-stone-600">{f.a}</AccordionContent></AccordionItem>)}</Accordion>
        </section>
      )}
    </div>
  );
}
