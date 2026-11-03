import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform, animate } from "framer-motion";
import {
  ArrowUpRight, BadgeCheck, Boxes, Building2, ChevronRight, CircleCheck, FileDown,
  Factory, MessageCircle, MoveRight, PackageCheck, Phone, Search, ShieldCheck, Sparkles,
  Truck, Wrench, Zap
} from "lucide-react";
import { toast } from "sonner";
import { ProductCard } from "@/components/shop/ProductCard";
import { Reveal, Skeleton } from "@/components/kit";
import { useApp } from "@/lib/store";
import { API, api, errMsg, img } from "@/lib/api";

const ease = [0.22, 1, 0.36, 1];

function Counter({ to, label, suffix = "+" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const controls = animate(0, Number(to || 0), {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [to]);
  return (
    <div>
      <div className="text-3xl font-black tracking-tight text-white sm:text-4xl">{n.toLocaleString("en-IN")}{suffix}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">{label}</div>
    </div>
  );
}

function Hero({ site, stats }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 650], [0, reduce ? 0 : 110]);
  const h = site?.content?.hero || {};
  const title = h.title || "Precision fasteners. Built for demanding work.";
  const subtitle = h.subtitle || "Reliable fasteners, hardware and industrial components supplied with consistency, speed and practical support.";

  return (
    <section className="hero-shell relative overflow-hidden bg-[#0b0e12] text-white" data-testid="home-hero">
      <motion.div style={{ y }} className="absolute inset-0">
        <img src={img(h.image)} alt="Industrial fasteners" className="h-[118%] w-full object-cover opacity-55" />
      </motion.div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(220,38,38,.24),transparent_32%),linear-gradient(90deg,#080a0d_0%,rgba(8,10,13,.88)_42%,rgba(8,10,13,.28)_100%)]" />
      <div className="hero-grid absolute inset-0 opacity-40" />

      <div className="relative mx-auto grid min-h-[760px] max-w-[1400px] items-end gap-12 px-5 pb-12 pt-28 lg:grid-cols-12 lg:px-10 lg:pb-16">
        <div className="lg:col-span-8">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e53935] shadow-[0_0_14px_#e53935]" />
            {h.eyebrow || "Industrial fasteners · Wholesale · Retail"}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 36 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: .08, duration: 1, ease }}
            className="max-w-4xl text-5xl font-black leading-[.92] tracking-[-.055em] sm:text-6xl lg:text-[88px]"
          >
            {title}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .25, duration: .7, ease }} className="mt-7 max-w-2xl text-base leading-7 text-white/65 sm:text-lg">
            {subtitle}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4, duration: .7, ease }} className="mt-9 flex flex-wrap gap-3">
            <Link to="/shop" className="red-button group inline-flex items-center gap-3 px-6 py-3.5 text-xs font-black uppercase tracking-[.18em]">
              Explore products <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link to="/quote" className="glass-button inline-flex items-center gap-3 px-6 py-3.5 text-xs font-black uppercase tracking-[.18em]">
              Request a quote <ChevronRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .55, duration: .8, ease }} className="lg:col-span-4">
          <div className="hero-stats rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
              <span className="text-[10px] font-bold uppercase tracking-[.2em] text-white/45">Seema Enterprise</span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Ready to supply</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Counter to={stats.products} label="Products" />
              <Counter to={stats.skus} label="SKUs" />
              <Counter to={stats.categories} label="Categories" />
            </div>
          </div>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#e53935] to-transparent" />
    </section>
  );
}

function SectionHeading({ eyebrow, title, text, action }) {
  return (
    <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="section-kicker">{eyebrow}</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-black tracking-[-.035em] text-[#111318] sm:text-5xl">{title}</h2>
        {text && <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">{text}</p>}
      </div>
      {action}
    </div>
  );
}

function CategoryGrid({ categories }) {
  const roots = categories.filter((c) => !c.parent_id);
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10" data-testid="collections-section">
      <Reveal><SectionHeading eyebrow="01 / Product range" title="Everything starts with the right specification." text="Browse by product family, compare options and move from discovery to quotation without the usual friction." action={<Link to="/shop" className="text-xs font-black uppercase tracking-[.18em] text-[#b91c1c]">View all products <MoveRight className="ml-1 inline h-4 w-4" /></Link>} /></Reveal>
      <div className="grid gap-4 md:grid-cols-12 md:auto-rows-[190px]">
        {roots.map((c, i) => (
          <Reveal key={c.id} delay={i * .06} className={`${i === 0 ? "md:col-span-7 md:row-span-2" : i === 1 ? "md:col-span-5" : "md:col-span-5"}`}>
            <Link to={`/category/${c.slug}`} className="industrial-card group relative block h-full min-h-[210px] overflow-hidden rounded-2xl bg-slate-200">
              <img src={img(c.image)} alt={c.name} className="absolute inset-0 h-full w-full object-cover transition duration-1000 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6">
                <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/55">Product family</p><h3 className="mt-1 text-2xl font-black tracking-tight text-white">{c.name}</h3></div>
                <span className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition group-hover:bg-[#e53935] group-hover:border-[#e53935]"><ArrowUpRight className="h-4 w-4" /></span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function TrustStrip() {
  const items = [
    [ShieldCheck, "Specification-first", "Clear grades, sizes and product details"],
    [PackageCheck, "Reliable dispatch", "Practical fulfilment for urgent orders"],
    [Building2, "Business pricing", "Wholesale, dealer and project enquiries"],
    [Wrench, "Technical support", "Help choosing the right fastener"],
  ];
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto grid max-w-[1400px] divide-y divide-slate-200 px-5 md:grid-cols-4 md:divide-x md:divide-y-0 lg:px-10">
        {items.map(([Icon, title, text]) => <div key={title} className="flex gap-4 py-7 md:px-7 first:md:pl-0 last:md:pr-0"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#d82727]" /><div><p className="text-sm font-black text-slate-900">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>)}
      </div>
    </section>
  );
}

function ProductRow({ title, eyebrow, items, link, testid }) {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10" data-testid={testid}>
      <Reveal><SectionHeading eyebrow={eyebrow} title={title} action={<Link to={link} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-[#b91c1c]">View collection <ArrowUpRight className="h-4 w-4" /></Link>} /></Reveal>
      <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
        {items ? items.slice(0, 4).map((p, i) => <ProductCard key={p.id} p={p} i={i} />) : [0,1,2,3].map((i) => <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />)}
      </div>
    </section>
  );
}

function CapabilityBand() {
  const items = [
    [Factory, "Industrial supply", "Fasteners and hardware for manufacturers, contractors, fabricators and trade buyers."],
    [Boxes, "Bulk-ready", "Structured quantities, variants and SKU-based ordering for repeat purchasing."],
    [BadgeCheck, "Quality-minded", "Product information is presented around grade, thread, finish and application."],
  ];
  return (
    <section className="relative overflow-hidden bg-[#101318] py-24 text-white">
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      <div className="relative mx-auto max-w-[1400px] px-5 lg:px-10">
        <Reveal><div className="max-w-2xl"><p className="section-kicker">02 / Why Seema</p><h2 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-6xl">A supplier that feels built for business.</h2><p className="mt-5 text-sm leading-7 text-white/55 sm:text-base">The website should make buying industrial products feel simple. Find the specification, confirm the quantity, send the requirement and keep moving.</p></div></Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
          {items.map(([Icon, title, text], i) => <Reveal key={title} delay={i*.08} className="bg-[#101318] p-8"><Icon className="h-7 w-7 text-[#ef4444]" /><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-3 text-sm leading-6 text-white/50">{text}</p><span className="mt-8 block text-[10px] font-black uppercase tracking-[.18em] text-white/30">0{i+1}</span></Reveal>)}
        </div>
      </div>
    </section>
  );
}

function CatalogueCTA() {
  return (
    <section className="mx-auto max-w-[1400px] px-5 py-24 lg:px-10">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-[#e21f26] px-7 py-10 text-white sm:px-12 sm:py-14">
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,.22),transparent_45%)]" />
          <div className="relative grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
            <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-white/60">Product catalogue</p><h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-.04em] sm:text-6xl">Need the complete range in one place?</h2><p className="mt-5 max-w-xl text-sm leading-6 text-white/70">Open the latest catalogue for product families, specifications and pricing information.</p></div>
            <a href={`${API}/catalogue.pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 text-xs font-black uppercase tracking-[.18em] text-[#a9161b] shadow-xl transition hover:-translate-y-0.5"><FileDown className="h-4 w-4" /> Download catalogue</a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function EnquirySection() {
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.post("/enquiries", { ...f, type: "bulk" }); toast.success("Enquiry received. Our team will contact you."); setF({ name: "", email: "", phone: "", company: "", message: "" }); }
    catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  const field = (key, placeholder, type="text") => <input required={key !== "company"} type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} placeholder={placeholder} className="form-dark" />;
  return (
    <section className="relative overflow-hidden bg-[#0b0e12] py-24 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(229,57,53,.16),transparent_30%)]" />
      <div className="relative mx-auto grid max-w-[1400px] gap-14 px-5 lg:grid-cols-12 lg:px-10">
        <Reveal className="lg:col-span-5"><p className="section-kicker">03 / Bulk & projects</p><h2 className="mt-2 text-4xl font-black tracking-[-.04em] sm:text-6xl">Tell us what you need. We'll quote fast.</h2><p className="mt-6 max-w-lg text-sm leading-7 text-white/50">Share product names, sizes, quantities or a drawing. This form is designed for trade and project requirements, not just retail orders.</p><div className="mt-10 flex flex-wrap gap-3"><Link to="/wholesale" className="glass-button inline-flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-[.16em]">Wholesale accounts <ArrowUpRight className="h-4 w-4" /></Link><a href="tel:8141933722" className="glass-button inline-flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-[.16em]"><Phone className="h-4 w-4" /> Call sales</a></div></Reveal>
        <Reveal delay={.1} className="lg:col-span-7"><form onSubmit={submit} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-6 backdrop-blur-xl sm:grid-cols-2 sm:p-8"><div>{field("name","Your name")}</div><div>{field("company","Company / firm")}</div><div>{field("email","Email","email")}</div><div>{field("phone","Phone")}</div><textarea required value={f.message} onChange={(e)=>setF({...f,message:e.target.value})} placeholder="Products, sizes, quantities and delivery city" className="form-dark min-h-32 sm:col-span-2" /><button disabled={busy} className="red-button justify-center py-3.5 text-xs font-black uppercase tracking-[.18em] sm:col-span-2">{busy ? "Sending…" : "Send enquiry"}</button></form></Reveal>
      </div>
    </section>
  );
}

function FAQ({ faqs }) {
  if (!faqs?.length) return null;
  return <section className="mx-auto max-w-4xl px-5 py-24 lg:px-10"><Reveal><p className="section-kicker text-center">04 / FAQ</p><h2 className="mt-2 text-center text-4xl font-black tracking-[-.04em]">Straight answers before you order.</h2></Reveal><div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{faqs.map((f,i)=><details key={i} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-sm font-black text-slate-900">{f.q}<span className="text-xl font-normal text-slate-400 transition group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{f.a}</p></details>)}</div></section>;
}

export default function Home() {
  const { site } = useApp();
  const [newItems, setNew] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [stats, setStats] = useState({ products: 0, skus: 0, categories: 0 });
  useEffect(() => {
    api.get("/products?tag=new&limit=8").then((r) => setNew(r.data.items)).catch(() => setNew([]));
    api.get("/products?tag=featured&limit=8").then((r) => setFeatured(r.data.items)).catch(() => setFeatured([]));
    api.get("/products?limit=500").then((r) => setStats((s) => ({ ...s, products: r.data.total, skus: r.data.items.reduce((a,p)=>a+(p.variants?.length||0),0) }))).catch(() => {});
  }, []);
  useEffect(() => { if (site) setStats((s) => ({ ...s, categories: (site.categories || []).length })); }, [site]);
  useEffect(() => { document.title = site?.content?.seo?.title || "Seema Enterprise | Industrial Fasteners & Hardware"; }, [site]);
  const categories = useMemo(() => site?.categories || [], [site]);
  const faqs = site?.content?.faqs || [];
  return <div className="overflow-hidden">
    <Hero site={site} stats={stats} />
    <TrustStrip />
    <CategoryGrid categories={categories} />
    <ProductRow title="New arrivals" eyebrow="05 / Just in" items={newItems} link="/shop?tag=new" testid="new-arrivals-section" />
    <CapabilityBand />
    <ProductRow title="Featured products" eyebrow="06 / Curated" items={featured} link="/shop?tag=featured" testid="featured-section" />
    <CatalogueCTA />
    <EnquirySection />
    <FAQ faqs={faqs} />
  </div>;
}
