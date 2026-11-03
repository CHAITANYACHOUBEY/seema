"""Shared pricing engine. Precedence (first match wins, documented in /app/docs/PRICING.md):
1 negotiated customer price > 2 group/contract price > 3 quantity tier > 4 active promotion > 5 standard retail."""
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from core import db, get_setting

GROUPS = {"wholesale", "dealer", "distributor"}


def D(x) -> Decimal:
    return Decimal(str(x or 0))


def r2(x) -> float:
    return float(D(x).quantize(Decimal("0.01"), ROUND_HALF_UP))


def channel(customer) -> str:
    if customer and customer.get("status") == "approved" and customer.get("price_group") in GROUPS:
        return customer["price_group"]
    return "retail"


def promo_active(v) -> bool:
    if not v.get("sale_price"):
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    return (not v.get("sale_start") or v["sale_start"] <= today) and (not v.get("sale_end") or today <= v["sale_end"])


async def negotiated_map(customer) -> dict:
    if not customer:
        return {}
    rows = await db.customer_prices.find({"customer_id": customer["id"]}, {"_id": 0}).to_list(5000)
    return {r["sku"]: r["price"] for r in rows}


def unit_price(product, variant, customer, qty, negotiated):
    sku = variant["sku"]
    if sku in negotiated:
        return D(negotiated[sku]), "negotiated"
    ch = channel(customer)
    if ch != "retail" and variant.get(ch):
        return D(variant[ch]), f"contract:{ch}"
    for t in sorted(product.get("tiers") or [], key=lambda t: -int(t.get("min_qty", 0))):
        if qty >= int(t.get("min_qty", 0)) > 0:
            return D(variant.get("retail")) * (1 - D(t.get("discount_pct")) / 100), f"quantity:{t['min_qty']}+"
    if promo_active(variant):
        return D(variant["sale_price"]), "promotion"
    return D(variant.get("retail")), "standard"


def public_price(product, variant, customer, negotiated):
    price, rule = unit_price(product, variant, customer, 1, negotiated)
    return {"price": r2(price), "rule": rule, "mrp": r2(variant.get("mrp")),
            "on_sale": rule == "promotion" or (rule != "standard" and price < D(variant.get("retail")))}


async def validate_coupon(code: str, subtotal: Decimal):
    if not code:
        return None, None
    c = await db.coupons.find_one({"code": code.strip().upper(), "active": True}, {"_id": 0})
    today = datetime.now(timezone.utc).date().isoformat()
    if not c:
        return None, "Coupon code is not valid"
    if (c.get("starts") and c["starts"] > today) or (c.get("ends") and c["ends"] < today):
        return None, "Coupon is not active right now"
    if c.get("usage_limit") and c.get("used", 0) >= c["usage_limit"]:
        return None, "Coupon usage limit reached"
    if subtotal < D(c.get("min_order")):
        return None, f"Coupon needs a minimum order of ₹{c.get('min_order')}"
    disc = subtotal * D(c["value"]) / 100 if c["type"] == "percent" else D(c["value"])
    if c.get("max_discount"):
        disc = min(disc, D(c["max_discount"]))
    return {"code": c["code"], "amount": min(disc, subtotal)}, None


async def compute(items, customer, ship_state="", coupon_code="", check_stock=True, shipping=None):
    """items: [{sku, qty, discount_pct?}]. Returns full priced snapshot; all amounts server-side."""
    company = await get_setting("company")
    commerce = await get_setting("commerce")
    incl = bool(commerce.get("prices_include_tax"))
    home = (company.get("state") or "Gujarat").strip().lower()
    inter = bool(ship_state) and ship_state.strip().lower() != home
    neg = await negotiated_map(customer)
    lines, errors = [], []
    for it in items:
        qty = int(it.get("qty") or 0)
        p = await db.products.find_one({"variants.sku": it["sku"]}, {"_id": 0})
        v = next((x for x in (p or {}).get("variants", []) if x["sku"] == it["sku"]), None)
        if not p or not v or p.get("status") != "active" or not p.get("is_published"):
            errors.append({"sku": it["sku"], "error": "This item is no longer available"})
            continue
        moq = int(p.get("moq") or 1)
        if qty < moq:
            errors.append({"sku": v["sku"], "error": f"Minimum order quantity is {moq}"})
        if check_stock and qty > int(v.get("stock") or 0):
            errors.append({"sku": v["sku"], "error": f"Only {v.get('stock', 0)} in stock"})
        price, rule = unit_price(p, v, customer, qty, neg)
        disc_pct = D(it.get("discount_pct"))
        gross = price * qty * (1 - disc_pct / 100)
        rate = D(p.get("gst_rate", 18))
        lines.append({"product_id": p["id"], "slug": p["slug"], "sku": v["sku"], "name": p["name"],
                      "variant": v.get("name", ""), "hsn": p.get("hsn", ""), "image": (p.get("images") or [""])[0],
                      "qty": qty, "moq": moq, "stock": v.get("stock", 0), "unit_price": r2(price), "rule": rule,
                      "mrp": r2(v.get("mrp")), "discount_pct": float(disc_pct), "gst_rate": float(rate),
                      "_gross": gross, "cost": r2(v.get("cost"))})
    subtotal = sum((l["_gross"] for l in lines), Decimal(0))
    coupon, cerr = await validate_coupon(coupon_code, subtotal)
    if cerr:
        errors.append({"sku": "", "error": cerr})
    cdisc = coupon["amount"] if coupon else Decimal(0)
    tax_tot = {"cgst": Decimal(0), "sgst": Decimal(0), "igst": Decimal(0)}
    taxable_tot = Decimal(0)
    for l in lines:
        share = (l["_gross"] / subtotal * cdisc) if subtotal else Decimal(0)
        net = l.pop("_gross") - share
        rate = D(l["gst_rate"])
        taxable = net / (1 + rate / 100) if incl else net
        tax = taxable * rate / 100
        taxable_tot += taxable
        if inter:
            tax_tot["igst"] += tax
            l.update(igst=r2(tax), cgst=0.0, sgst=0.0)
        else:
            tax_tot["cgst"] += tax / 2
            tax_tot["sgst"] += tax / 2
            l.update(cgst=r2(tax / 2), sgst=r2(tax / 2), igst=0.0)
        l.update(line_subtotal=r2(net + share), coupon_share=r2(share), taxable=r2(taxable), tax=r2(tax),
                 total=r2(taxable + tax))
    if shipping is None:
        free_above = D(commerce.get("free_shipping_above"))
        shipping = Decimal(0) if not lines or (free_above and subtotal >= free_above) else D(commerce.get("shipping_flat"))
    shipping = D(shipping)
    tax_sum = sum(tax_tot.values(), Decimal(0))
    grand = taxable_tot + tax_sum + shipping
    return {"lines": lines, "errors": errors, "subtotal": r2(subtotal), "coupon": coupon and {"code": coupon["code"], "amount": r2(cdisc)},
            "discount": r2(cdisc), "taxable": r2(taxable_tot), "cgst": r2(tax_tot["cgst"]), "sgst": r2(tax_tot["sgst"]),
            "igst": r2(tax_tot["igst"]), "tax": r2(tax_sum), "shipping": r2(shipping), "grand_total": r2(grand),
            "inter_state": inter, "prices_include_tax": incl}
