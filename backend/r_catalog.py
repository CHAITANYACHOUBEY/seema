import csv
import io
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from core import (audit, current_member, customer_for, db, get_setting, give_stock, has_perm, is_staff, new_id, now,
                  optional_member, record_movement, require_perm, slugify, take_stock)
from pdfs import catalogue_pdf
from pricing import negotiated_map, public_price
from storage import APP_NAME, get_object, put_object

router = APIRouter(prefix="/api")
PRICE_FIELDS = ("mrp", "retail", "sale_price", "wholesale", "dealer", "distributor", "cost")


def sanitize(p, member, customer, neg):
    staff = has_perm(member, "prices.view_wholesale")
    out = {k: v for k, v in p.items() if k != "_id"}
    vs = []
    for v in p.get("variants", []):
        pv = {k: v.get(k) for k in ("sku", "name", "options", "mrp", "retail", "sale_price", "sale_start", "sale_end",
                                     "stock", "barcode", "weight_g")}
        pv["in_stock"] = (v.get("stock") or 0) > 0
        pv.update(public_price(p, v, customer, neg))
        if staff:
            pv.update({k: v.get(k) for k in ("wholesale", "dealer", "distributor", "cost", "reorder_level")})
        vs.append(pv)
    out["variants"] = vs
    out["from_price"] = min((v["price"] for v in vs), default=0)
    out["mrp"] = vs[0]["mrp"] if vs else 0
    out["in_stock"] = any(v["in_stock"] for v in vs)
    return out


async def descendants(cat_id):
    ids, frontier = [cat_id], [cat_id]
    while frontier:
        kids = await db.categories.find({"parent_id": {"$in": frontier}}, {"id": 1, "_id": 0}).to_list(500)
        frontier = [k["id"] for k in kids]
        ids += frontier
    return ids


@router.get("/site")
async def site():
    company = await get_setting("company")
    commerce = await get_setting("commerce")
    import os
    content = (await db.content.find_one({"key": "site"}, {"_id": 0}) or {}).get("value", {})
    cats = await db.categories.find({}, {"_id": 0}).sort("sort", 1).to_list(1000)
    return {"company": company, "content": content, "categories": cats,
            "commerce": {k: commerce.get(k) for k in ("shipping_flat", "free_shipping_above", "cod_enabled", "bank_transfer_enabled",
                                                      "prices_include_tax", "bank_details", "cod_max")},
            "razorpay": {"enabled": bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET")),
                         "key_id": os.environ.get("RAZORPAY_KEY_ID", "")}}


@router.get("/products")
async def list_products(request: Request, category: str = "", q: str = "", sort: str = "newest", tag: str = "",
                        in_stock: bool = False, min_price: float = 0, max_price: float = 0, page: int = 1, limit: int = 24,
                        member=Depends(optional_member)):
    query = {"status": "active", "is_published": True}
    cat = None
    if category:
        cat = await db.categories.find_one({"slug": category}, {"_id": 0})
        if not cat:
            raise HTTPException(404, "Category not found")
        query["category_id"] = {"$in": await descendants(cat["id"])}
    if q:
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query["$or"] = [{"name": rx}, {"variants.sku": rx}, {"tags": rx}, {"description": rx}]
    if tag == "new":
        query["is_new"] = True
    elif tag == "featured":
        query["is_featured"] = True
    for k, v in request.query_params.items():
        if k.startswith("a_") and v:
            query[f"attributes.{k[2:]}"] = v
    if in_stock:
        query["variants.stock"] = {"$gt": 0}
    docs = await db.products.find(query, {"_id": 0}).to_list(1000)
    customer = await customer_for(member)
    neg = await negotiated_map(customer)
    items = [sanitize(p, member, customer, neg) for p in docs]
    facets = {}
    for p in items:
        for k, v in (p.get("attributes") or {}).items():
            facets.setdefault(k, set()).add(str(v))
    if min_price:
        items = [p for p in items if p["from_price"] >= min_price]
    if max_price:
        items = [p for p in items if p["from_price"] <= max_price]
    key = {"price_asc": (lambda p: p["from_price"], False), "price_desc": (lambda p: p["from_price"], True),
           "name": (lambda p: p["name"].lower(), False)}.get(sort, (lambda p: p.get("created_at", ""), True))
    items.sort(key=key[0], reverse=key[1])
    total = len(items)
    start = (max(page, 1) - 1) * limit
    return {"items": items[start:start + limit], "total": total, "page": page, "category": cat,
            "facets": {k: sorted(v) for k, v in facets.items()}}


@router.get("/products/by-sku/{sku}")
async def by_sku(sku: str, member=Depends(optional_member)):
    p = await db.products.find_one({"variants.sku": sku.strip(), "status": "active", "is_published": True}, {"_id": 0})
    if not p:
        raise HTTPException(404, f"SKU {sku} not found")
    customer = await customer_for(member)
    out = sanitize(p, member, customer, await negotiated_map(customer))
    return {"product": out, "variant": next(v for v in out["variants"] if v["sku"] == sku.strip())}


@router.get("/products/{slug}")
async def product_detail(slug: str, member=Depends(optional_member)):
    p = await db.products.find_one({"slug": slug}, {"_id": 0})
    if not p or (not (p.get("is_published") and p.get("status") == "active") and not is_staff(member)):
        raise HTTPException(404, "Product not found")
    customer = await customer_for(member)
    neg = await negotiated_map(customer)
    rel_q = {"status": "active", "is_published": True, "id": {"$ne": p["id"]},
             "$or": [{"id": {"$in": p.get("related") or []}}, {"category_id": p["category_id"]}]}
    related = await db.products.find(rel_q, {"_id": 0}).limit(4).to_list(4)
    cat = await db.categories.find_one({"id": p["category_id"]}, {"_id": 0})
    return {"product": sanitize(p, member, customer, neg), "category": cat,
            "related": [sanitize(r, member, customer, neg) for r in related]}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ctype = await run_in_threadpool(get_object, path)
    return Response(content=data, media_type=rec.get("content_type", ctype), headers={"Cache-Control": "public, max-age=86400"})


@router.get("/catalogue.pdf")
async def public_catalogue(category: str = "", prices: bool = True):
    q = {"status": "active", "is_published": True}
    title = "Product Catalogue"
    if category:
        cat = await db.categories.find_one({"slug": category}, {"_id": 0})
        if cat:
            q["category_id"] = {"$in": await descendants(cat["id"])}
            title = f"{cat['name']} — Catalogue"
    docs = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    pdf = await run_in_threadpool(catalogue_pdf, await get_setting("company"), title, docs,
                                  "Retail (excl. GST)" if prices else None, lambda p, v: public_price(p, v, None, {})["price"])
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="seema-catalogue.pdf"'})


@router.get("/sitemap.xml")
async def sitemap(request: Request):
    base = str(request.base_url).rstrip("/").replace("http://", "https://")
    prods = await db.products.find({"status": "active", "is_published": True}, {"slug": 1, "_id": 0}).to_list(5000)
    cats = await db.categories.find({}, {"slug": 1, "_id": 0}).to_list(1000)
    urls = ["/", "/shop", "/wholesale", "/about", "/contact", "/faq"] + [f"/category/{c['slug']}" for c in cats] + [f"/product/{p['slug']}" for p in prods]
    body = "".join(f"<url><loc>{base}{u}</loc></url>" for u in urls)
    return Response(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>', media_type="application/xml")


# ---------------- Admin: uploads, categories, products ----------------
ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "video/mp4": "mp4"}


@router.post("/admin/upload")
async def upload(file: UploadFile = File(...), member=Depends(current_member)):
    if not (has_perm(member, "products.edit") or has_perm(member, "content.edit")):
        raise HTTPException(403, "Not allowed")
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Only JPG, PNG, WEBP, PDF or MP4 files are allowed")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File is larger than 15 MB")
    path = f"{APP_NAME}/public/{uuid.uuid4()}.{ALLOWED[file.content_type]}"
    res = await run_in_threadpool(put_object, path, data, file.content_type)
    await db.files.insert_one({"id": new_id(), "storage_path": res["path"], "original_filename": file.filename,
                               "content_type": file.content_type, "size": len(data), "is_deleted": False,
                               "created_at": now(), "by": member["email"]})
    return {"url": f"/api/files/{res['path']}", "name": file.filename}


class CategoryIn(BaseModel):
    name: str
    slug: str = ""
    parent_id: Optional[str] = None
    description: str = ""
    image: str = ""
    attributes: list = []
    sort: int = 0
    seo_title: str = ""
    seo_description: str = ""


@router.post("/admin/categories")
async def create_category(body: CategoryIn, member=Depends(require_perm("products.edit"))):
    doc = {**body.model_dump(), "id": new_id(), "slug": slugify(body.slug or body.name), "created_at": now()}
    if await db.categories.find_one({"slug": doc["slug"]}):
        raise HTTPException(409, "A category with this URL already exists")
    await db.categories.insert_one(doc)
    await audit(member, "create", "category", doc["id"], {"name": body.name})
    doc.pop("_id", None)
    return doc


@router.put("/admin/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, member=Depends(require_perm("products.edit"))):
    if body.parent_id == cid:
        raise HTTPException(400, "A category cannot be its own parent")
    upd = {**body.model_dump(), "slug": slugify(body.slug or body.name)}
    if await db.categories.find_one({"slug": upd["slug"], "id": {"$ne": cid}}):
        raise HTTPException(409, "A category with this URL already exists")
    res = await db.categories.update_one({"id": cid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "Category not found")
    await audit(member, "update", "category", cid, {"name": body.name})
    return {"ok": True}


@router.delete("/admin/categories/{cid}")
async def delete_category(cid: str, member=Depends(require_perm("products.edit"))):
    if await db.products.count_documents({"category_id": cid}) or await db.categories.count_documents({"parent_id": cid}):
        raise HTTPException(409, "Move its products and subcategories first")
    await db.categories.delete_one({"id": cid})
    await audit(member, "delete", "category", cid)
    return {"ok": True}


class VariantIn(BaseModel):
    sku: str
    name: str = ""
    options: dict = {}
    mrp: float = 0
    retail: float
    sale_price: Optional[float] = None
    sale_start: str = ""
    sale_end: str = ""
    wholesale: Optional[float] = None
    dealer: Optional[float] = None
    distributor: Optional[float] = None
    cost: float = 0
    stock: int = 0
    reorder_level: int = 10
    barcode: str = ""
    weight_g: float = 0


class ProductIn(BaseModel):
    name: str
    slug: str = ""
    category_id: str
    description: str = ""
    images: list = []
    documents: list = []
    videos: list = []
    attributes: dict = {}
    specs: list = []
    tags: list = []
    hsn: str = ""
    gst_rate: float = 18
    moq: int = 1
    tiers: list = []
    is_published: bool = False
    is_featured: bool = False
    is_new: bool = False
    related: list = []
    seo_title: str = ""
    seo_description: str = ""
    variants: list[VariantIn]


async def _check_product(body: ProductIn, pid=None):
    if not body.variants:
        raise HTTPException(400, "Add at least one variant with a SKU and price")
    skus = [v.sku.strip() for v in body.variants]
    if len(set(skus)) != len(skus) or not all(skus):
        raise HTTPException(400, "Each variant needs a unique SKU")
    if any(v.retail <= 0 for v in body.variants):
        raise HTTPException(400, "Retail price must be greater than zero")
    clash = await db.products.find_one({"variants.sku": {"$in": skus}, "id": {"$ne": pid}}, {"name": 1, "_id": 0})
    if clash:
        raise HTTPException(409, f"SKU already used by {clash['name']}")
    if not await db.categories.find_one({"id": body.category_id}):
        raise HTTPException(400, "Choose a valid category")


@router.get("/admin/products")
async def admin_products(q: str = "", category_id: str = "", status: str = "", page: int = 1, limit: int = 50,
                         member=Depends(require_perm("products.view"))):
    query = {}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        query["$or"] = [{"name": rx}, {"variants.sku": rx}]
    if category_id:
        query["category_id"] = category_id
    if status:
        query["status"] = status
    total = await db.products.count_documents(query)
    docs = await db.products.find(query, {"_id": 0}).sort("updated_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": [sanitize(p, member, None, {}) for p in docs], "total": total}


@router.get("/admin/products/export.csv")
async def export_products(member=Depends(require_perm("products.view"))):
    out = io.StringIO()
    w = csv.writer(out)
    cols = ["sku", "product", "variant", "category_id", "mrp", "retail", "sale_price", "wholesale", "dealer", "distributor", "cost", "stock", "published"]
    w.writerow(cols)
    staff_prices = has_perm(member, "prices.view_wholesale")
    async for p in db.products.find({}, {"_id": 0}):
        for v in p["variants"]:
            w.writerow([v["sku"], p["name"], v.get("name"), p["category_id"], v.get("mrp"), v.get("retail"), v.get("sale_price") or "",
                        *(v.get(k) or "" if staff_prices else "" for k in ("wholesale", "dealer", "distributor", "cost")),
                        v.get("stock"), p.get("is_published")])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="products.csv"'})


@router.post("/admin/products/import")
async def import_prices(file: UploadFile = File(...), member=Depends(require_perm("prices.edit"))):
    """Bulk price/stock update by SKU. Price columns update prices; a 'stock' column records a physical-count adjustment."""
    rows = list(csv.DictReader(io.StringIO((await file.read()).decode("utf-8-sig"))))
    updated, missing = 0, []
    for r in rows:
        sku = (r.get("sku") or "").strip()
        p = await db.products.find_one({"variants.sku": sku}, {"_id": 0})
        if not p:
            missing.append(sku)
            continue
        v = next(x for x in p["variants"] if x["sku"] == sku)
        sets, hist = {}, []
        for f in PRICE_FIELDS:
            if r.get(f) not in (None, ""):
                val = float(r[f])
                if v.get(f) != val:
                    sets[f"variants.$.{f}"] = val
                    hist.append({"field": f, "old": v.get(f), "new": val})
        if sets:
            await db.products.update_one({"id": p["id"], "variants.sku": sku}, {"$set": sets})
            await db.price_history.insert_many([{**h, "id": new_id(), "sku": sku, "at": now(), "by": member["email"], "source": "import"} for h in hist])
        if r.get("stock") not in (None, "") and has_perm(member, "inventory.edit"):
            delta = int(float(r["stock"])) - int(v.get("stock") or 0)
            if delta:
                await give_stock(p["id"], sku, delta)
                await record_movement(member, p["id"], sku, delta, "count", "import", "Bulk import stock count")
        updated += 1
    await audit(member, "import", "product_prices", "", {"rows": len(rows), "updated": updated})
    return {"updated": updated, "missing": missing}


@router.get("/admin/products/{pid}")
async def admin_product(pid: str, member=Depends(require_perm("products.view"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    out = sanitize(p, member, None, {})
    out["price_history"] = await db.price_history.find({"sku": {"$in": [v["sku"] for v in p["variants"]]}}, {"_id": 0}).sort("at", -1).to_list(100)
    return out


@router.post("/admin/products")
async def create_product(body: ProductIn, member=Depends(require_perm("products.edit"))):
    await _check_product(body)
    slug = slugify(body.slug or body.name)
    if await db.products.find_one({"slug": slug}):
        slug = f"{slug}-{new_id()[:4]}"
    doc = {**body.model_dump(), "id": new_id(), "slug": slug, "status": "active", "created_at": now(), "updated_at": now()}
    for v in doc["variants"]:
        v["sku"] = v["sku"].strip()
    await db.products.insert_one(doc)
    for v in doc["variants"]:
        if v["stock"]:
            await record_movement(member, doc["id"], v["sku"], v["stock"], "opening", doc["id"], "Opening stock")
    await audit(member, "create", "product", doc["id"], {"name": body.name})
    return {"id": doc["id"], "slug": slug}


@router.put("/admin/products/{pid}")
async def update_product(pid: str, body: ProductIn, member=Depends(require_perm("products.edit"))):
    old = await db.products.find_one({"id": pid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Product not found")
    await _check_product(body, pid)
    old_v = {v["sku"]: v for v in old["variants"]}
    new_vs, hist = [], []
    for v in body.model_dump()["variants"]:
        v["sku"] = v["sku"].strip()
        prev = old_v.get(v["sku"])
        if prev:
            v["stock"] = prev.get("stock", 0)  # stock changes only via inventory ledger
            for f in PRICE_FIELDS:
                if (prev.get(f) or 0) != (v.get(f) or 0):
                    hist.append({"id": new_id(), "sku": v["sku"], "field": f, "old": prev.get(f), "new": v.get(f), "at": now(), "by": member["email"], "source": "edit"})
        new_vs.append(v)
    if hist and not has_perm(member, "prices.edit"):
        raise HTTPException(403, "You do not have permission to change prices")
    upd = {**body.model_dump(), "variants": new_vs, "slug": slugify(body.slug) if body.slug else old["slug"], "updated_at": now()}
    if await db.products.find_one({"slug": upd["slug"], "id": {"$ne": pid}}):
        raise HTTPException(409, "Another product already uses this URL")
    await db.products.update_one({"id": pid}, {"$set": upd})
    for v in new_vs:
        if v["sku"] not in old_v and v["stock"]:
            await record_movement(member, pid, v["sku"], v["stock"], "opening", pid, "Opening stock (new variant)")
    if hist:
        await db.price_history.insert_many(hist)
        await audit(member, "price_change", "product", pid, {"changes": [{k: h[k] for k in ("sku", "field", "old", "new")} for h in hist]})
    await audit(member, "update", "product", pid, {"name": body.name})
    return {"ok": True, "slug": upd["slug"]}


@router.post("/admin/products/{pid}/duplicate")
async def duplicate_product(pid: str, member=Depends(require_perm("products.edit"))):
    p = await db.products.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Product not found")
    sfx = new_id()[:4].upper()
    p.update(id=new_id(), name=p["name"] + " (Copy)", slug=f"{p['slug']}-copy-{sfx.lower()}", is_published=False,
             created_at=now(), updated_at=now())
    for v in p["variants"]:
        v.update(sku=f"{v['sku']}-COPY-{sfx}", stock=0)
    await db.products.insert_one(p)
    await audit(member, "duplicate", "product", p["id"], {"from": pid})
    return {"id": p["id"]}


class StatusIn(BaseModel):
    status: Optional[str] = None
    is_published: Optional[bool] = None


@router.post("/admin/products/{pid}/status")
async def product_status(pid: str, body: StatusIn, member=Depends(require_perm("products.edit"))):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd.get("status") and upd["status"] not in ("active", "archived"):
        raise HTTPException(400, "Invalid status")
    await db.products.update_one({"id": pid}, {"$set": {**upd, "updated_at": now()}})
    await audit(member, "status", "product", pid, upd)
    return {"ok": True}
