from core import db, new_id, now, slugify

ATTR_BATH = [{"key": "Material", "type": "select", "options": ["SS 304", "SS 202", "Brass", "Aluminium"]},
             {"key": "Finish", "type": "select", "options": ["Chrome", "Brushed Silver", "Matte Black", "Rose Gold"]},
             {"key": "Warranty", "type": "text", "options": []}]
ATTR_FAST = [{"key": "Material", "type": "select", "options": ["SS 304", "SS 316", "MS Zinc Plated"]},
             {"key": "Thread", "type": "text", "options": []}, {"key": "Head Type", "type": "select", "options": ["Pan", "CSK", "Hex"]}]


def _v(sku, name, opts, retail, mrp, stock, cost, sale=None):
    return {"sku": sku, "name": name, "options": opts, "mrp": mrp, "retail": retail, "sale_price": sale, "sale_start": "",
            "sale_end": "", "wholesale": round(retail * 0.8, 2), "dealer": round(retail * 0.72, 2),
            "distributor": round(retail * 0.65, 2), "cost": cost, "stock": stock, "reorder_level": 10, "barcode": "", "weight_g": 0}


async def seed():
    await db.products.create_index("variants.sku", unique=True)
    await db.products.create_index("slug", unique=True)
    await db.payments.create_index("gateway_payment_id", unique=True, sparse=True)
    await db.webhook_events.create_index("event_id", unique=True)
    await db.customers.create_index("user_id", unique=True, partialFilterExpression={"user_id": {"$type": "string"}})
    await db.orders.create_index([("user_id", 1), ("idempotency_key", 1)], unique=True,
                                 partialFilterExpression={"idempotency_key": {"$type": "string"}})
    await db.customer_prices.create_index([("customer_id", 1), ("sku", 1)], unique=True)
    if not await db.settings.find_one({"key": "company"}):
        await db.settings.insert_many([
            {"key": "company", "value": {"name": "Seema Enterprise", "tagline": "Manufacturer & supplier of bathroom accessories, stainless steel hardware and fasteners",
                                         "gstin": "", "phone": "8141933722 / 8866744368", "email": "seemaenterprise393@gmail.com", "whatsapp": "8141933722", "address": "Block No-5E, Gokul Park, Thebachda Mahika Road, Mahika, Rajkot, Rajkot, Gujarat, 360020", "state": "Gujarat",
                                         "logo_url": "", "social": {"instagram": "", "facebook": "", "youtube": "", "linkedin": ""}}},
            {"key": "commerce", "value": {"shipping_flat": 150, "free_shipping_above": 5000, "cod_enabled": True, "cod_max": 20000,
                                          "bank_transfer_enabled": True, "bank_details": "", "prices_include_tax": False,
                                          "invoice_prefix": "SE/", "quote_prefix": "QT/", "max_staff_discount": 10,
                                          "serviceable_pincodes": ""}}])
    if not await db.content.find_one({"key": "site"}):
        await db.content.insert_one({"key": "site", "value": {
            "announcement": "Wholesale & dealer pricing available — apply for a business account",
            "hero": {"eyebrow": "Manufacturer · Wholesale · Retail", "title": "Precision-made fittings for spaces that last",
                     "subtitle": "Bathroom accessories, stainless steel hardware and fasteners — made and supplied by Seema Enterprise, Gujarat.",
                     "image": "/samples/s1.jpeg"},
            "banners": [{"title": "Bulk orders for builders & contractors", "text": "Quantity pricing, GST invoices and dispatch across India.",
                         "image": "/samples/s6.jpeg", "link": "/wholesale"}],
            "faqs": [{"q": "Do you supply in bulk?", "a": "Yes. Register a business account or send a quotation request with your quantities."},
                     {"q": "Do you provide GST invoices?", "a": "Yes, every confirmed order receives a GST invoice from the admin team."},
                     {"q": "How are wholesale prices shown?", "a": "Approved business accounts see their price group automatically after signing in."}],
            "testimonials": [],
            "pages": {"about": "[Add your company story in Admin → Website Content]",
                      "quality": "[Add your manufacturing and quality process in Admin → Website Content]",
                      "shipping": "[Add your shipping policy in Admin → Website Content]",
                      "returns": "[Add your returns & replacement policy in Admin → Website Content]",
                      "privacy": "[Add your privacy policy in Admin → Website Content]",
                      "terms": "[Add your terms & conditions in Admin → Website Content]"},
            "seo": {"title": "Seema Enterprise — Bathroom Accessories, SS Hardware & Fasteners",
                    "description": "Manufacturer and wholesale supplier of bathroom accessories, stainless steel accessories, sanitary products and fasteners."}}})
    if await db.categories.count_documents({}) == 0:
        cats = {}
        for name, parent, attrs, img in [("Bathroom Accessories", None, ATTR_BATH, "/samples/s5.jpeg"),
                                         ("Towel Rails & Racks", "Bathroom Accessories", ATTR_BATH, "/samples/s5.jpeg"),
                                         ("Hooks & Holders", "Bathroom Accessories", ATTR_BATH, "/samples/s8.jpeg"),
                                         ("Stainless Steel Accessories", None, ATTR_BATH, "/samples/s7.jpeg"),
                                         ("Sanitary Products", None, ATTR_BATH, "/samples/s3.jpeg"),
                                         ("Fasteners", None, ATTR_FAST, "/samples/s6.jpeg")]:
            cid = new_id()
            cats[name] = cid
            await db.categories.insert_one({"id": cid, "name": name, "slug": slugify(name), "parent_id": cats.get(parent),
                                            "description": "", "image": img, "attributes": attrs, "sort": len(cats), "created_at": now()})
        samples = [
            ("[Sample] Tribeca Towel Rail 24\"", "Towel Rails & Racks", "/samples/s5.jpeg", {"Material": "SS 304", "Finish": "Brushed Silver"},
             [_v("SE-TR24-BS", "Brushed Silver", {"Finish": "Brushed Silver"}, 1450, 1890, 120, 820),
              _v("SE-TR24-MB", "Matte Black", {"Finish": "Matte Black"}, 1590, 2090, 60, 900, sale=1390)], True, True),
            ("[Sample] Aria Robe Hook (Double)", "Hooks & Holders", "/samples/s8.jpeg", {"Material": "SS 304", "Finish": "Chrome"},
             [_v("SE-RH2-CH", "Chrome", {"Finish": "Chrome"}, 390, 520, 400, 190)], True, False),
            ("[Sample] Linea Soap Dish", "Hooks & Holders", "/samples/s2.jpeg", {"Material": "Brass", "Finish": "Chrome"},
             [_v("SE-SD1-CH", "Chrome", {"Finish": "Chrome"}, 640, 850, 8, 330)], False, True),
            ("[Sample] Monarch Tumbler Holder", "Stainless Steel Accessories", "/samples/s7.jpeg", {"Material": "SS 202", "Finish": "Rose Gold"},
             [_v("SE-TH1-RG", "Rose Gold", {"Finish": "Rose Gold"}, 780, 990, 75, 410)], True, True),
            ("[Sample] Cascade Pillar Cock", "Sanitary Products", "/samples/s3.jpeg", {"Material": "Brass", "Finish": "Chrome"},
             [_v("SE-PC1-CH", "Chrome", {"Finish": "Chrome"}, 1890, 2450, 40, 1100)], False, True),
            ("[Sample] Vessel Basin Waste Coupling", "Sanitary Products", "/samples/s4.jpeg", {"Material": "SS 304", "Finish": "Chrome"},
             [_v("SE-WC1-CH", "Chrome", {"Finish": "Chrome"}, 520, 690, 200, 240)], True, False),
            ("[Sample] SS 304 Self-Tapping Screw (Box of 100)", "Fasteners", "/samples/s6.jpeg", {"Material": "SS 304", "Head Type": "Pan"},
             [_v("SE-ST-8x25", "No.8 x 25mm", {"Size": "8x25"}, 260, 340, 900, 120), _v("SE-ST-10x38", "No.10 x 38mm", {"Size": "10x38"}, 340, 440, 650, 160)], True, False),
        ]
        for name, cat, img, attrs, variants, is_new, featured in samples:
            pid = new_id()
            fast = cat == "Fasteners"
            await db.products.insert_one({
                "id": pid, "name": name, "slug": slugify(name), "category_id": cats[cat], "description":
                "Sample product created to demonstrate the catalogue. Replace with your real product details and photos in Admin → Products.",
                "images": [img], "documents": [], "videos": [], "attributes": attrs,
                "specs": [{"label": "Model", "value": variants[0]["sku"]}, {"label": "Warranty", "value": "[set warranty]"}],
                "tags": ["sample"], "hsn": "7318" if fast else "7324", "gst_rate": 18, "moq": 5 if fast else 1,
                "tiers": [{"min_qty": 50, "discount_pct": 5}, {"min_qty": 200, "discount_pct": 10}],
                "is_published": True, "is_featured": featured, "is_new": is_new, "status": "active", "related": [],
                "seo_title": "", "seo_description": "", "variants": variants, "created_at": now(), "updated_at": now()})
            for v in variants:
                await db.stock_movements.insert_one({"id": new_id(), "at": now(), "product_id": pid, "sku": v["sku"], "qty": v["stock"],
                                                     "type": "opening", "balance_after": v["stock"], "ref": "seed", "note": "Opening stock (sample)", "by": "system"})
