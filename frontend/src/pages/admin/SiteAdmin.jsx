import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Btn, Field, PageHead, Skeleton } from "@/components/kit";
import { Panel } from "@/pages/admin/AdminLayout";
import { useApp } from "@/lib/store";
import { api, errMsg, img } from "@/lib/api";

const uploadFile = async (file) => { const fd = new FormData(); fd.append("file", file); return (await api.post("/admin/upload", fd)).data.url; };

const ListEditor = ({ title, items, fields, onChange, testid }) => (
  <Panel title={title} action={<button className="text-xs underline" data-testid={`${testid}-add`} onClick={() => onChange([...items, Object.fromEntries(fields.map(([k]) => [k, ""]))])}>+ Add</button>}>
    {items.map((it, i) => <div key={i} className="mb-3 grid gap-2 border-b border-stone-100 pb-3 sm:grid-cols-[1fr_auto]"><div className="grid gap-2 sm:grid-cols-2">
      {fields.map(([k, l, type]) => type === "image" ? <Field key={k} label={l}><div className="flex items-center gap-2">{it[k] && <img src={img(it[k])} alt="" className="h-10 w-10 object-cover" />}<input type="file" accept="image/*" onChange={async (e) => { try { const u = await uploadFile(e.target.files[0]); onChange(items.map((x, j) => (j === i ? { ...x, [k]: u } : x))); } catch (err) { toast.error(errMsg(err)); } }} /></div></Field>
        : <Field key={k} label={l}><input className="field" data-testid={`${testid}-${i}-${k}`} value={it[k] || ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></Field>)}
    </div><button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button></div>)}
  </Panel>
);

export function Content() {
  const { site } = useApp();
  const [c, setC] = useState(null);
  useEffect(() => { if (site) setC(site.content); }, [site]);
  if (!c) return <Skeleton className="h-96" />;
  const save = async () => { try { await api.put("/admin/content", c); toast.success("Website content saved — refresh the storefront to see it"); } catch (e) { toast.error(errMsg(e)); } };
  const setH = (k, v) => setC({ ...c, hero: { ...c.hero, [k]: v } });
  return (
    <div className="space-y-4 pb-20">
      <PageHead title="Website content" sub="Edit home page, banners, FAQs, testimonials, policies and SEO without touching code."><Btn variant="gold" onClick={save} data-testid="content-save-btn">Save content</Btn></PageHead>
      <Panel title="Announcement & hero"><div className="grid gap-3 sm:grid-cols-2">
        <Field label="Announcement bar" className="sm:col-span-2"><input className="field" data-testid="content-announcement" value={c.announcement || ""} onChange={(e) => setC({ ...c, announcement: e.target.value })} /></Field>
        <Field label="Hero eyebrow"><input className="field" value={c.hero?.eyebrow || ""} onChange={(e) => setH("eyebrow", e.target.value)} /></Field>
        <Field label="Hero title"><input className="field" data-testid="content-hero-title" value={c.hero?.title || ""} onChange={(e) => setH("title", e.target.value)} /></Field>
        <Field label="Hero subtitle" className="sm:col-span-2"><textarea className="field" value={c.hero?.subtitle || ""} onChange={(e) => setH("subtitle", e.target.value)} /></Field>
        <Field label="Hero image"><div className="flex items-center gap-2"><img src={img(c.hero?.image)} alt="" className="h-12 w-20 object-cover" /><input type="file" accept="image/*" onChange={async (e) => { try { setH("image", await uploadFile(e.target.files[0])); } catch (err) { toast.error(errMsg(err)); } }} /></div></Field>
      </div></Panel>
      <ListEditor title="Promotional banners" testid="banner" items={c.banners || []} onChange={(v) => setC({ ...c, banners: v })} fields={[["title", "Title"], ["text", "Text"], ["link", "Link (e.g. /wholesale)"], ["image", "Image", "image"]]} />
      <ListEditor title="FAQs" testid="faq" items={c.faqs || []} onChange={(v) => setC({ ...c, faqs: v })} fields={[["q", "Question"], ["a", "Answer"]]} />
      <ListEditor title="Testimonials (real customers only)" testid="testimonial" items={c.testimonials || []} onChange={(v) => setC({ ...c, testimonials: v })} fields={[["quote", "Quote"], ["name", "Name"], ["company", "Company"]]} />
      <Panel title="Pages & policies"><div className="grid gap-3 md:grid-cols-2">{Object.entries(c.pages || {}).map(([k, v]) => <Field key={k} label={k}><textarea className="field min-h-[120px]" data-testid={`content-page-${k}`} value={v} onChange={(e) => setC({ ...c, pages: { ...c.pages, [k]: e.target.value } })} /></Field>)}</div></Panel>
      <Panel title="SEO (home page)"><div className="grid gap-3 sm:grid-cols-2"><Field label="Title"><input className="field" value={c.seo?.title || ""} onChange={(e) => setC({ ...c, seo: { ...c.seo, title: e.target.value } })} /></Field><Field label="Description"><input className="field" value={c.seo?.description || ""} onChange={(e) => setC({ ...c, seo: { ...c.seo, description: e.target.value } })} /></Field></div></Panel>
    </div>
  );
}

export function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return <Skeleton className="h-96" />;
  const co = s.company, cm = s.commerce;
  const setCo = (k, v) => setS({ ...s, company: { ...co, [k]: v } });
  const setCm = (k, v) => setS({ ...s, commerce: { ...cm, [k]: v } });
  const save = async (key) => { try { await api.put(`/admin/settings/${key}`, s[key]); toast.success("Settings saved"); } catch (e) { toast.error(errMsg(e)); } };
  const t = (k, l) => <Field key={k} label={l}><input className="field" data-testid={`set-${k}`} value={co[k] || ""} onChange={(e) => setCo(k, e.target.value)} /></Field>;
  const n = (k, l) => <Field key={k} label={l}><input type="number" className="field" data-testid={`set-${k}`} value={cm[k] ?? 0} onChange={(e) => setCm(k, Number(e.target.value))} /></Field>;
  const b = (k, l) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" data-testid={`set-${k}`} checked={!!cm[k]} onChange={(e) => setCm(k, e.target.checked)} />{l}</label>;
  return (
    <div className="space-y-4">
      <PageHead title="Company settings" sub="Leave a field empty rather than entering unverified details — nothing is invented for you." />
      <Panel title="Company & branding" action={<Btn onClick={() => save("company")} data-testid="save-company-btn">Save</Btn>}><div className="grid gap-3 sm:grid-cols-3">
        {t("name", "Company name")}{t("tagline", "Tagline")}{t("gstin", "GSTIN")}{t("phone", "Phone")}{t("email", "Email")}{t("whatsapp", "WhatsApp number (with country code)")}{t("state", "State (for GST: CGST/SGST vs IGST)")}
        <Field label="Address" className="sm:col-span-2"><textarea className="field" data-testid="set-address" value={co.address || ""} onChange={(e) => setCo("address", e.target.value)} /></Field>
        <Field label="Logo"><div className="flex items-center gap-2">{co.logo_url && <img src={img(co.logo_url)} alt="" className="h-10" />}<input type="file" accept="image/*" data-testid="set-logo-upload" onChange={async (e) => { try { setCo("logo_url", await uploadFile(e.target.files[0])); } catch (err) { toast.error(errMsg(err)); } }} /></div></Field>
        {["instagram", "facebook", "youtube", "linkedin"].map((k) => <Field key={k} label={k}><input className="field" value={co.social?.[k] || ""} onChange={(e) => setCo("social", { ...co.social, [k]: e.target.value })} /></Field>)}
      </div></Panel>
      <Panel title="Checkout, shipping, tax & numbering" action={<Btn onClick={() => save("commerce")} data-testid="save-commerce-btn">Save</Btn>}><div className="grid gap-3 sm:grid-cols-3">
        {n("shipping_flat", "Flat shipping charge ₹")}{n("free_shipping_above", "Free shipping above ₹ (0 = never)")}{n("cod_max", "COD max order ₹")}{n("max_staff_discount", "Max line discount without manager approval %")}
        <Field label="Invoice prefix"><input className="field" value={cm.invoice_prefix || ""} onChange={(e) => setCm("invoice_prefix", e.target.value)} /></Field>
        <Field label="Serviceable pincode prefixes (comma separated, empty = all India)"><input className="field" value={cm.serviceable_pincodes || ""} onChange={(e) => setCm("serviceable_pincodes", e.target.value)} /></Field>
        <Field label="Bank transfer details (shown at checkout)" className="sm:col-span-3"><textarea className="field" value={cm.bank_details || ""} onChange={(e) => setCm("bank_details", e.target.value)} /></Field>
        <div className="flex flex-wrap gap-6 sm:col-span-3">{b("cod_enabled", "Cash on delivery")}{b("bank_transfer_enabled", "Bank transfer")}{b("prices_include_tax", "Entered prices include GST")}</div>
      </div></Panel>
    </div>
  );
}
