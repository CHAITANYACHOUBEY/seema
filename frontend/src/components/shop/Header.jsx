import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Show, SignInButton, UserButton } from "@clerk/react";
import { ChevronDown, LayoutDashboard, Menu, Search, ShoppingBag, User, X, ArrowUpRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { img } from "@/lib/api";

const Logo = ({ site, light = false }) => (
  <Link to="/" data-testid="logo-link" className="flex items-center gap-3">
    {site?.company?.logo_url ? <img src={img(site.company.logo_url)} alt={site.company.name || "Seema Enterprise"} className="h-10 w-auto" /> : <img src="/seema-logo.png" alt="Seema Enterprise" className={`h-11 w-auto object-contain ${light ? "brightness-0 invert" : ""}`} />}
  </Link>
);

function MegaMenu({ cats, onClose }) {
  const roots = cats.filter((c) => !c.parent_id);
  return <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .2 }} className="absolute left-0 right-0 top-full border-t border-slate-200 bg-white shadow-2xl" data-testid="mega-menu">
    <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-8 px-8 py-8 md:grid-cols-4 lg:px-10">
      {roots.map((r) => <div key={r.id}><Link to={`/category/${r.slug}`} onClick={onClose} className="group block"><div className="mb-3 aspect-[16/9] overflow-hidden rounded-xl bg-slate-100"><img src={img(r.image)} alt={r.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /></div><p className="text-sm font-black group-hover:text-[#d82727]">{r.name}</p></Link>{cats.filter((c) => c.parent_id === r.id).map((c) => <Link key={c.id} to={`/category/${c.slug}`} onClick={onClose} className="mt-2 block text-xs font-medium text-slate-500 hover:text-[#d82727]">{c.name}</Link>)}</div>)}
    </div>
  </motion.div>;
}

const NAV = [["/shop?tag=new", "New arrivals"], ["/wholesale", "Wholesale"], ["/quote", "Request quote"], ["/about", "About"], ["/contact", "Contact"]];

export default function Header() {
  const { site, cart, setDrawer, isStaff } = useApp();
  const [mega, setMega] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  useEffect(() => { document.body.style.overflow = mobile ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [mobile]);
  const search = (e) => { e.preventDefault(); if (q.trim()) nav(`/shop?q=${encodeURIComponent(q.trim())}`); setMobile(false); };
  return <header className="sticky top-0 z-50" onMouseLeave={() => setMega(false)}>
    {site?.content?.announcement && <div className="bg-[#101318] px-4 py-2 text-center text-[10px] font-bold uppercase tracking-[.2em] text-white/60" data-testid="announcement-bar">{site.content.announcement}</div>}
    <div className="relative border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1400px] items-center gap-5 px-5 lg:px-10">
        <button className="lg:hidden" onClick={() => setMobile(true)} data-testid="mobile-menu-btn" aria-label="Menu"><Menu className="h-5 w-5" /></button>
        <Logo site={site} />
        <nav className="ml-4 hidden items-center gap-5 xl:gap-7 lg:flex">
          <button data-testid="nav-shop" onMouseEnter={() => setMega(true)} onClick={() => nav("/shop")} className="flex items-center gap-1 text-[11px] font-black uppercase tracking-[.14em] hover:text-[#d82727]">Shop <ChevronDown className="h-3.5 w-3.5" /></button>
          {NAV.map(([to, label]) => <NavLink key={to} to={to} onMouseEnter={() => setMega(false)} end className={({isActive}) => `text-[11px] font-black uppercase tracking-[.14em] hover:text-[#d82727] ${isActive && !to.includes("?") ? "text-[#d82727]" : "text-slate-700"}`}>{label}</NavLink>)}
        </nav>
        <form onSubmit={search} className="ml-auto hidden items-center rounded-full border border-slate-200 bg-slate-50 px-3 md:flex">
          <Search className="h-4 w-4 text-slate-400" /><input data-testid="header-search-input" value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search products or SKU" className="w-36 bg-transparent px-2 py-2 text-xs outline-none xl:w-48" />
        </form>
        <div className="flex items-center gap-3 sm:gap-4">
          {isStaff && <Link to="/admin" className="hidden items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#b91c1c] sm:flex"><LayoutDashboard className="h-4 w-4" />Admin</Link>}
          <Show when="signed-in"><Link to="/account" aria-label="Account"><User className="h-5 w-5" /></Link><UserButton /></Show>
          <Show when="signed-out"><SignInButton><button data-testid="sign-in-btn" className="hidden text-[10px] font-black uppercase tracking-widest hover:text-[#d82727] sm:block">Sign in</button></SignInButton></Show>
          <button data-testid="cart-open-btn" onClick={()=>setDrawer(true)} className="relative rounded-full p-1" aria-label="Cart"><ShoppingBag className="h-5 w-5" />{cart?.count>0&&<motion.span key={cart.count} initial={{scale:0}} animate={{scale:1}} className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#e53935] px-1 text-[9px] font-black text-white">{cart.count}</motion.span>}</button>
        </div>
      </div>
      <AnimatePresence>{mega && site && <MegaMenu cats={site.categories || []} onClose={()=>setMega(false)} />}</AnimatePresence>
    </div>
    <AnimatePresence>{mobile && <motion.div className="fixed inset-0 z-[70] bg-[#0b0e12] text-white" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div className="flex items-center justify-between px-5 py-5"><Logo site={site} light /><button onClick={()=>setMobile(false)} aria-label="Close"><X /></button></div>
      <form onSubmit={search} className="mx-5 flex items-center border-b border-white/15"><Search className="h-4 w-4 text-white/50"/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search products or SKU" className="w-full bg-transparent px-2 py-4 text-sm outline-none"/></form>
      <div className="space-y-1 px-5 py-7">{[["/shop","Shop all"],...(site?.categories||[]).filter(c=>!c.parent_id).map(c=>[`/category/${c.slug}`,c.name]),...NAV,["/account","My account"],...(isStaff?[["/admin","Admin"]]:[])].map(([to,label],i)=><motion.div key={to} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:i*.035}}><Link to={to} onClick={()=>setMobile(false)} className="flex items-center justify-between border-b border-white/10 py-3 text-2xl font-black tracking-tight">{label}<ArrowUpRight className="h-4 w-4 text-white/35"/></Link></motion.div>)}</div>
    </motion.div>}</AnimatePresence>
  </header>;
}
