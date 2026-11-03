import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { img, inr, ruleLabel } from "@/lib/api";

export const ProductCard = ({ p, i = 0 }) => {
  const reduce = useReducedMotion();
  const v = p.variants?.[0] || {};
  const label = ruleLabel(v.rule);
  return <motion.article initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: .6, delay: (i % 4) * .06 }} className="group" data-testid={`product-card-${p.slug}`}>
    <Link to={`/product/${p.slug}`} className="block">
      <div className="relative aspect-[4/4.7] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <img src={img(p.images?.[0])} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-1000 ease-out group-hover:scale-[1.055]" />
        <div className="absolute left-3 top-3 flex flex-col gap-1">{p.is_new&&<span className="rounded-full bg-[#101318] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white">New</span>}{!p.in_stock&&<span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-700 shadow-sm">Out of stock</span>}{label&&<span className="rounded-full bg-[#e53935] px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white">{label}</span>}</div>
        <div className="absolute bottom-3 right-3 grid h-10 w-10 translate-y-2 place-items-center rounded-full bg-white text-slate-900 opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100"><ArrowUpRight className="h-4 w-4"/></div>
      </div>
      <div className="pt-4"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">{v.sku}{p.variants?.length>1?` · ${p.variants.length} options`:""}</p><h3 className="mt-1 line-clamp-2 text-[15px] font-black leading-snug text-slate-900 transition-colors group-hover:text-[#b91c1c]">{p.name}</h3><div className="mt-2 flex items-baseline gap-2"><span className="text-base font-black">{inr(p.from_price)}</span>{p.mrp>p.from_price&&<span className="text-xs text-slate-400 line-through">{inr(p.mrp)}</span>}<span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">+GST</span></div></div>
    </Link>
  </motion.article>;
};

export const WishIcon = () => null;
