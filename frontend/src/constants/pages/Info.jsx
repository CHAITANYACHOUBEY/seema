import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Btn, Field, Reveal } from "@/components/kit";
import { waLink } from "@/components/shop/Footer";
import { useApp } from "@/lib/store";
import { api, errMsg } from "@/lib/api";

const TITLES = { about: "About Seema Enterprise", quality: "Manufacturing & quality", shipping: "Shipping policy", returns: "Returns & replacement policy", privacy: "Privacy policy", terms: "Terms & conditions" };

export function InfoPage({ page }) {
  const { site } = useApp();
  useEffect(() => { document.title = `${TITLES[page]} | Seema Enterprise`; }, [page]);
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <Reveal><p className="eyebrow">{site?.company?.name}</p><h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl" data-testid="info-title">{TITLES[page]}</h1>
        <div className="mt-8 whitespace-pre-line leading-relaxed text-stone-700" data-testid="info-body">{site?.content?.pages?.[page]}</div></Reveal>
    </div>
  );
}

export function FaqPage() {
  const { site } = useApp();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16"><p className="eyebrow">Help</p><h1 className="mt-2 font-display text-5xl font-semibold">Frequently asked questions</h1>
      <Accordion type="single" collapsible className="mt-8">{(site?.content?.faqs || []).map((f, i) => <AccordionItem key={i} value={`q${i}`}><AccordionTrigger className="text-left">{f.q}</AccordionTrigger><AccordionContent className="text-stone-600">{f.a}</AccordionContent></AccordionItem>)}</Accordion>
    </div>
  );
}

export function ContactPage() {
  const { site } = useApp();
  const c = site?.company || {};
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "" });
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post("/enquiries", { ...f, type: "contact" }); toast.success("Message sent. We'll get back to you soon."); setF({ name: "", email: "", phone: "", message: "" }); } catch (err) { toast.error(errMsg(err)); }
  };
  const wa = waLink(c.whatsapp, "Hello Seema Enterprise");
  return (
    <div className="mx-auto grid max-w-6xl gap-14 px-5 py-16 lg:grid-cols-2">
      <div><p className="eyebrow">Contact</p><h1 className="mt-2 font-display text-5xl font-semibold">Let's talk</h1>
        <div className="mt-8 space-y-4 text-sm" data-testid="contact-details">
          {c.address && <p className="flex gap-3"><MapPin className="h-5 w-5 text-[#C5A059]" />{c.address}</p>}
          {c.phone && <p className="flex gap-3"><Phone className="h-5 w-5 text-[#C5A059]" /><a href={`tel:${c.phone}`}>{c.phone}</a></p>}
          {c.email && <p className="flex gap-3"><Mail className="h-5 w-5 text-[#C5A059]" /><a href={`mailto:${c.email}`}>{c.email}</a></p>}
          {wa && <a href={wa} target="_blank" rel="noreferrer" className="flex gap-3"><MessageCircle className="h-5 w-5 text-[#C5A059]" />Chat on WhatsApp</a>}
          {!c.address && !c.phone && !c.email && <p className="text-stone-500">Contact details will appear here once added in Admin → Settings.</p>}
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4 border border-stone-200 bg-white p-8" data-testid="contact-form">
        {["name", "email", "phone"].map((k) => <Field key={k} label={k}><input required={k !== "phone"} type={k === "email" ? "email" : "text"} className="field" data-testid={`contact-${k}-input`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label="Message"><textarea required className="field min-h-[120px]" data-testid="contact-message-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <Btn data-testid="contact-submit-btn" className="w-full py-3">Send message</Btn>
      </form>
    </div>
  );
}
