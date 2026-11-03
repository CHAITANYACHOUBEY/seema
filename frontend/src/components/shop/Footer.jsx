import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, errMsg } from "@/lib/api";

export const waLink = (num, text="") => num ? `https://wa.me/${num.replace(/\D/g,"")}?text=${encodeURIComponent(text)}` : null;

export default function Footer() {
  const { site } = useApp();
  const [email,setEmail] = useState("");
  const c = { name: "Seema Enterprise", tagline: "Industrial fasteners, hardware and project supply.", phone: "8141933722 / 8866744368", email: "seemaenterprise393@gmail.com", whatsapp: "8141933722", address: "Block No-5E, Gokul Park, Thebachda Mahika Road, Mahika, Rajkot, Rajkot, Gujarat, 360020", ...(site?.company || {}) };
  const subscribe = async (e) => { e.preventDefault(); try { await api.post("/enquiries",{type:"newsletter",name:"Newsletter subscriber",email}); toast.success("Subscribed. Thank you!"); setEmail(""); } catch(err) { toast.error(errMsg(err)); } };
  const wa = waLink(c.whatsapp || c.phone || "8141933722", "Hello Seema Enterprise, I have an enquiry.");
  return <footer className="bg-[#090b0e] text-white">
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10 lg:py-20">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4"><img src="/seema-logo.png" alt="Seema Enterprise" className="h-16 w-auto object-contain"/><p className="mt-5 max-w-sm text-sm leading-6 text-white/45">{c.tagline || "Industrial fasteners, hardware and project supply from Seema Enterprise."}</p><div className="mt-7 space-y-3 text-xs text-white/55">{c.address&&<p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-[#ef4444]"/>{c.address}</p>}{c.phone&&<p className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-[#ef4444]"/>{c.phone}</p>}{c.email&&<p className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-[#ef4444]"/>{c.email}</p>}</div></div>
        <div className="grid gap-10 sm:grid-cols-3 lg:col-span-4"><div><p className="footer-kicker">Products</p>{(site?.categories||[]).filter(x=>!x.parent_id).slice(0,6).map(x=><Link key={x.id} to={`/category/${x.slug}`} className="footer-link">{x.name}</Link>)}</div><div><p className="footer-kicker">Company</p>{[["/about","About"],["/quality","Quality"],["/wholesale","Wholesale"],["/faq","FAQ"],["/contact","Contact"]].map(([to,l])=><Link key={to} to={to} className="footer-link">{l}</Link>)}</div><div><p className="footer-kicker">Support</p>{[["/shipping-policy","Shipping"],["/returns-policy","Returns"],["/privacy","Privacy"],["/terms","Terms"]].map(([to,l])=><Link key={to} to={to} className="footer-link">{l}</Link>)}</div></div>
        <div className="lg:col-span-4"><p className="footer-kicker">Stay in the loop</p><h3 className="mt-3 text-2xl font-black tracking-tight">Product updates and trade news.</h3><form onSubmit={subscribe} className="mt-6 flex rounded-xl border border-white/10 bg-white/[.035] p-1"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Business email" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-white/25"/><button className="rounded-lg bg-[#e53935] px-4 text-[10px] font-black uppercase tracking-widest">Subscribe</button></form><a href={`${process.env.REACT_APP_BACKEND_URL}/api/catalogue.pdf`} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-white/60 hover:text-white">Download catalogue <ArrowUpRight className="h-4 w-4"/></a></div>
      </div>
    </div>
    <div className="border-t border-white/10"><div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[10px] font-bold uppercase tracking-[.14em] text-white/25 lg:px-10"><span>© {new Date().getFullYear()} {c.name || "Seema Enterprise"}</span><span>Built for fasteners. Designed for business.</span></div></div>
    {wa&&<a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="fixed bottom-5 right-5 z-40 grid h-13 w-13 place-items-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-110"><MessageCircle className="h-6 w-6"/></a>}
  </footer>;
}
