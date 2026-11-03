import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Btn, Field, PageHead } from "@/components/kit";
import { useApp } from "@/lib/store";
import { api, errMsg, img } from "@/lib/api";

const BLANK = { name: "", slug: "", parent_id: null, description: "", image: "", attributes: [], sort: 0, seo_title: "", seo_description: "" };

export default function Categories() {
  const { site, can } = useApp();
  const [cats, setCats] = useState(null);
  const [edit, setEdit] = useState(null);
  const list = cats || site?.categories || [];
  const reload = async () => setCats((await api.get("/site")).data.categories);
  const save = async () => {
    try { edit.id ? await api.put(`/admin/categories/${edit.id}`, edit) : await api.post("/admin/categories", edit); toast.success("Category saved"); setEdit(null); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (c) => { if (!window.confirm(`Delete ${c.name}?`)) return; try { await api.delete(`/admin/categories/${c.id}`); toast.success("Deleted"); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const upload = async (e) => { const fd = new FormData(); fd.append("file", e.target.files[0]); try { const r = await api.post("/admin/upload", fd); setEdit({ ...edit, image: r.data.url }); } catch (err) { toast.error(errMsg(err)); } };
  const setA = (i, k, v) => setEdit({ ...edit, attributes: edit.attributes.map((a, j) => (j === i ? { ...a, [k]: v } : a)) });
  const row = (c, depth = 0) => [
    <tr key={c.id} data-testid={`category-row-${c.slug}`}><td style={{ paddingLeft: 12 + depth * 24 }}><div className="flex items-center gap-3"><img src={img(c.image)} alt="" className="h-9 w-9 object-cover" /><b>{c.name}</b></div></td><td>/category/{c.slug}</td><td className="text-xs">{c.attributes.map((a) => a.key).join(", ")}</td>
      <td className="space-x-3 whitespace-nowrap">{can("products.edit") && <><button className="underline" data-testid={`category-edit-${c.slug}`} onClick={() => setEdit(c)}>Edit</button><button className="underline" onClick={() => setEdit({ ...BLANK, parent_id: c.id, attributes: c.attributes })}>+ Sub</button><button className="text-red-600 underline" onClick={() => del(c)}>Delete</button></>}</td></tr>,
    ...list.filter((x) => x.parent_id === c.id).flatMap((x) => row(x, depth + 1)),
  ];
  return (
    <div>
      <PageHead title="Categories" sub="Unlimited nested categories with their own attribute definitions — no code changes needed.">{can("products.edit") && <Btn onClick={() => setEdit({ ...BLANK })} data-testid="category-new-btn"><Plus className="h-4 w-4" />New category</Btn>}</PageHead>
      <div className="overflow-x-auto border border-stone-200 bg-white"><table className="admin-table w-full"><thead><tr><th>Name</th><th>URL</th><th>Attributes</th><th /></tr></thead><tbody>{list.filter((c) => !c.parent_id).flatMap((c) => row(c))}</tbody></table></div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-white">
          <DialogHeader><DialogTitle className="font-display text-2xl">{edit?.id ? "Edit category" : "New category"}</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className="field" data-testid="cat-name-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="URL slug (optional)"><input className="field" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
            <Field label="Parent"><select className="field" value={edit.parent_id || ""} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value || null })}><option value="">— Top level —</option>{list.filter((c) => c.id !== edit.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Sort order"><input type="number" className="field" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} /></Field>
            <Field label="Image" className="sm:col-span-2"><div className="flex items-center gap-3">{edit.image && <img src={img(edit.image)} alt="" className="h-12 w-12 object-cover" />}<input type="file" accept="image/*" onChange={upload} /></div></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="field" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="SEO title"><input className="field" value={edit.seo_title || ""} onChange={(e) => setEdit({ ...edit, seo_title: e.target.value })} /></Field>
            <Field label="Meta description"><input className="field" value={edit.seo_description || ""} onChange={(e) => setEdit({ ...edit, seo_description: e.target.value })} /></Field>
            <div className="sm:col-span-2"><p className="eyebrow mb-2">Attributes for products in this category</p>
              {edit.attributes.map((a, i) => <div key={i} className="mb-2 grid grid-cols-[1fr_110px_2fr_auto] gap-2">
                <input className="field" placeholder="e.g. Finish" data-testid={`cat-attr-key-${i}`} value={a.key} onChange={(e) => setA(i, "key", e.target.value)} />
                <select className="field" value={a.type} onChange={(e) => setA(i, "type", e.target.value)}><option value="text">Text</option><option value="select">Choice</option></select>
                <input className="field" placeholder="Choices, comma separated" disabled={a.type !== "select"} value={(a.options || []).join(", ")} onChange={(e) => setA(i, "options", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
                <button onClick={() => setEdit({ ...edit, attributes: edit.attributes.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button></div>)}
              <button className="text-xs underline" data-testid="cat-add-attr" onClick={() => setEdit({ ...edit, attributes: [...edit.attributes, { key: "", type: "text", options: [] }] })}>+ Add attribute</button></div>
            <Btn variant="gold" onClick={save} className="sm:col-span-2" data-testid="cat-save-btn">Save category</Btn>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
