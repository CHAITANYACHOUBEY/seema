"""Seema Enterprise backend regression suite (catalog, auth, pricing, cart, checkout, orders, quotes, inventory, admin)."""
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

from conftest import BASE_URL as B

S = {}  # shared state between ordered tests
ADDR_GJ = {"name": "TEST_Buyer", "phone": "9876543210", "line1": "TEST_ 1 Road", "city": "Ahmedabad", "state": "Gujarat", "pincode": "380001"}
ADDR_MH = {**ADDR_GJ, "city": "Mumbai", "state": "Maharashtra", "pincode": "400001"}
LEAK = {"wholesale", "dealer", "distributor", "cost"}


def set_cart(c, items):
    c.post(f"{B}/api/cart/items", json={"sku": "SE-RH2-CH", "qty": 0, "mode": "set"})
    cur = c.get(f"{B}/api/cart").json()
    for l in cur["lines"]:
        c.post(f"{B}/api/cart/items", json={"sku": l["sku"], "qty": 0, "mode": "set"})
    for sku, q in items:
        r = c.post(f"{B}/api/cart/items", json={"sku": sku, "qty": q, "mode": "set"})
        assert r.status_code == 200, r.text
    return c.get(f"{B}/api/cart").json()


# ---------- Public catalog ----------
class TestPublic:
    def test_site(self, anon):
        d = anon.get(f"{B}/api/site").json()
        assert d["razorpay"]["enabled"] is False and d["commerce"]["shipping_flat"] == 150
        assert any(c["slug"] == "fasteners" for c in d["categories"])

    def test_products_filters(self, anon):
        assert anon.get(f"{B}/api/products").json()["total"] >= 7
        assert all("SS 304" == p["attributes"]["Material"] for p in anon.get(f"{B}/api/products", params={"a_Material": "SS 304"}).json()["items"])
        assert anon.get(f"{B}/api/products", params={"q": "towel"}).json()["total"] >= 1
        assert anon.get(f"{B}/api/products", params={"category": "bathroom-accessories"}).json()["total"] >= 1
        assert anon.get(f"{B}/api/products", params={"category": "nope-xx"}).status_code == 404
        r = anon.get(f"{B}/api/products", params={"tag": "new"}).json()
        assert all(p.get("is_new") for p in r["items"])
        pr = [p["from_price"] for p in anon.get(f"{B}/api/products", params={"sort": "price_asc"}).json()["items"]]
        assert pr == sorted(pr)
        assert all(p["in_stock"] for p in anon.get(f"{B}/api/products", params={"in_stock": "true"}).json()["items"])

    def test_search_special_chars(self, anon):
        r = anon.get(f"{B}/api/products", params={"q": "[abc"})
        assert r.status_code == 200, f"search with '[' returns {r.status_code}"

    def test_detail_and_sku_no_leak(self, anon):
        d = anon.get(f"{B}/api/products/sample-tribeca-towel-rail-24").json()
        for v in d["product"]["variants"]:
            assert not (LEAK & set(v)), v.keys()
        assert d["product"]["variants"][0]["price"] == 1450
        s = anon.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()
        assert s["variant"]["sku"] == "SE-RH2-CH" and not (LEAK & set(s["variant"]))
        assert anon.get(f"{B}/api/products/by-sku/NOPE-1").status_code == 404

    def test_pdf_sitemap(self, anon):
        r = anon.get(f"{B}/api/catalogue.pdf")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        r = anon.get(f"{B}/api/sitemap.xml")
        assert r.status_code == 200 and "/product/sample-linea-soap-dish" in r.text


# ---------- Auth / permissions ----------
class TestPerms:
    def test_no_token(self, anon):
        assert anon.get(f"{B}/api/me").status_code == 401
        assert anon.post(f"{B}/api/checkout", json={}).status_code in (401, 422)
        assert anon.post(f"{B}/api/checkout", json={"address": ADDR_GJ, "payment_method": "cod"}).status_code == 401

    def test_roles(self, admin, buyer, sales):
        a, b, s = (c.get(f"{B}/api/me").json() for c in (admin, buyer, sales))
        assert a["role"] == "admin" and b["role"] == "customer" and s["role"] == "sales_executive"
        S["buyer_cid"] = b["customer"]["id"]
        S["sales_cid"] = s["customer"]["id"]

    def test_customer_forbidden(self, buyer):
        for p in ("/api/admin/dashboard", "/api/admin/orders", "/api/admin/quotations", "/api/admin/products"):
            assert buyer.get(B + p).status_code == 403, p

    def test_sales_exec(self, sales):
        assert sales.get(f"{B}/api/admin/quotations").status_code == 200
        assert sales.put(f"{B}/api/admin/settings/commerce", json={}).status_code == 403
        assert sales.get(f"{B}/api/admin/users").status_code == 403
        assert sales.post(f"{B}/api/admin/products", json={"name": "x", "category_id": "x", "variants": []}).status_code == 403


# ---------- Cart / GST / pricing ----------
class TestCart:
    def test_guest_cart_merge(self, anon, buyer):
        gid = str(uuid.uuid4())
        h = {"X-Cart-Id": gid}
        assert anon.get(f"{B}/api/cart").status_code == 400
        r = anon.post(f"{B}/api/cart/items", json={"sku": "SE-RH2-CH", "qty": 3}, headers=h)
        assert r.status_code == 200 and r.json()["count"] == 3
        for l in r.json()["lines"]:
            assert "cost" not in l, f"guest cart line exposes cost={l.get('cost')}"

    def test_merge(self, anon, buyer):
        set_cart(buyer, [])
        gid = str(uuid.uuid4())
        anon.post(f"{B}/api/cart/items", json={"sku": "SE-PC1-CH", "qty": 2}, headers={"X-Cart-Id": gid})
        r = buyer.post(f"{B}/api/cart/merge", json={"guest_id": gid})
        assert r.status_code == 200 and any(l["sku"] == "SE-PC1-CH" and l["qty"] == 2 for l in r.json()["lines"])
        assert anon.get(f"{B}/api/cart", headers={"X-Cart-Id": gid}).json()["count"] == 0

    def test_gst_intra_inter(self, buyer):
        set_cart(buyer, [("SE-RH2-CH", 2)])
        g = buyer.get(f"{B}/api/cart", params={"state": "Gujarat"}).json()
        assert g["subtotal"] == 780 and g["cgst"] == g["sgst"] == 70.2 and g["igst"] == 0
        assert g["shipping"] == 150 and g["grand_total"] == round(780 + 140.4 + 150, 2)
        m = buyer.get(f"{B}/api/cart", params={"state": "Maharashtra"}).json()
        assert m["igst"] == 140.4 and m["cgst"] == 0 and m["inter_state"] is True

    def test_free_shipping_and_tier(self, buyer):
        c = set_cart(buyer, [("SE-TR24-BS", 50)])
        l = c["lines"][0]
        assert l["unit_price"] == round(1450 * 0.95, 2) and l["rule"].startswith("quantity:50")
        assert c["shipping"] == 0

    def test_moq_and_stock(self, buyer):
        c = set_cart(buyer, [("SE-ST-8x25", 2)])
        assert any("Minimum order quantity is 5" in e["error"] for e in c["errors"])
        c = set_cart(buyer, [("SE-SD1-CH", 50)])
        assert any("in stock" in e["error"] for e in c["errors"])
        r = buyer.post(f"{B}/api/checkout", json={"address": ADDR_GJ, "payment_method": "cod"})
        assert r.status_code == 409

    def test_coupon(self, admin, buyer):
        r = admin.post(f"{B}/api/admin/coupons", json={"code": "TEST_SAVE10", "type": "percent", "value": 10, "min_order": 1000})
        assert r.status_code == 200, r.text
        set_cart(buyer, [("SE-RH2-CH", 2)])
        c = buyer.get(f"{B}/api/cart", params={"coupon": "TEST_SAVE10"}).json()
        assert any("minimum" in e["error"] for e in c["errors"])
        set_cart(buyer, [("SE-RH2-CH", 4)])
        c = buyer.get(f"{B}/api/cart", params={"coupon": "test_save10", "state": "Gujarat"}).json()
        assert c["discount"] == 156.0 and c["taxable"] == 1404.0 and not c["errors"]


# ---------- Checkout ----------
class TestCheckout:
    def test_razorpay_400(self, buyer):
        set_cart(buyer, [("SE-RH2-CH", 2)])
        r = buyer.post(f"{B}/api/checkout", json={"address": ADDR_GJ, "payment_method": "razorpay"})
        assert r.status_code == 400

    def test_cod_order_idempotent(self, admin, buyer):
        before = admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"]
        key = str(uuid.uuid4())
        r = buyer.post(f"{B}/api/checkout", json={"address": ADDR_GJ, "payment_method": "cod", "notes": "TEST_order"}, headers={"Idempotency-Key": key})
        assert r.status_code == 200, r.text
        o = r.json()["order"]
        import re
        assert re.fullmatch(r"SE-\d{4}-\d{2}-\d{5}", o["number"]) and o["status"] == "confirmed"
        S["order"] = o
        after = admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"]
        assert after == before - 2
        mv = admin.get(f"{B}/api/admin/inventory/movements", params={"sku": "SE-RH2-CH"}).json()
        assert any(m["ref"] == o["number"] and m["type"] == "sale" and m["qty"] == -2 for m in mv)
        r2 = buyer.post(f"{B}/api/checkout", json={"address": ADDR_GJ, "payment_method": "cod"}, headers={"Idempotency-Key": key})
        assert r2.status_code == 200 and r2.json()["order"]["id"] == o["id"]
        d = buyer.get(f"{B}/api/orders/{o['id']}").json()
        assert d["number"] == o["number"] and all("cost" not in l for l in d["lines"])
        assert all("cost" not in l for l in o["lines"]), "checkout response exposes line cost to customer"

    def test_bank_transfer_igst(self, buyer):
        set_cart(buyer, [("SE-RH2-CH", 1)])
        r = buyer.post(f"{B}/api/checkout", json={"address": ADDR_MH, "payment_method": "bank_transfer", "notes": "TEST_bt"})
        assert r.status_code == 200, r.text
        o = r.json()["order"]
        assert o["igst"] > 0 and o["cgst"] == 0 and o["payment_method"] == "bank_transfer"
        S["bt_order"] = o

    def test_concurrent_no_oversell(self, admin, buyer, sales):
        stock = admin.get(f"{B}/api/products/by-sku/SE-SD1-CH").json()["variant"]["stock"]
        if stock < 5 or stock >= 10:
            pytest.skip(f"SE-SD1-CH stock {stock} not in [5,10)")
        set_cart(buyer, [("SE-SD1-CH", 5)])
        set_cart(sales, [("SE-SD1-CH", 5)])
        body = {"address": ADDR_GJ, "payment_method": "cod", "notes": "TEST_concurrent"}
        with ThreadPoolExecutor(2) as ex:
            res = list(ex.map(lambda c: c.post(f"{B}/api/checkout", json=body), [buyer, sales]))
        codes = sorted(r.status_code for r in res)
        ok = [r.json()["order"] for r in res if r.status_code == 200]
        for o in ok:  # restock
            admin.post(f"{B}/api/admin/orders/{o['id']}/status", json={"status": "cancelled", "note": "TEST cleanup"})
        set_cart(sales, [])
        assert codes == [200, 409], codes
        assert admin.get(f"{B}/api/products/by-sku/SE-SD1-CH").json()["variant"]["stock"] == stock


# ---------- Order lifecycle ----------
class TestOrderLifecycle:
    def test_status_flow(self, admin):
        oid = S["order"]["id"]
        assert admin.post(f"{B}/api/admin/orders/{oid}/status", json={"status": "delivered"}).status_code == 409
        for st in ("processing", "packed"):
            assert admin.post(f"{B}/api/admin/orders/{oid}/status", json={"status": st}).status_code == 200
        r = admin.post(f"{B}/api/admin/orders/{oid}/status", json={"status": "shipped", "courier": "TEST_Courier", "tracking_number": "TRK1"})
        assert r.status_code == 200
        assert admin.post(f"{B}/api/admin/orders/{oid}/status", json={"status": "cancelled"}).status_code == 409
        assert admin.post(f"{B}/api/admin/orders/{oid}/status", json={"status": "delivered"}).status_code == 200
        o = admin.get(f"{B}/api/orders/{oid}").json()
        assert o["status"] == "delivered" and o["shipment"]["tracking_number"] == "TRK1"

    def test_payments(self, admin):
        o = S["order"]
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/payments", json={"amount": o["grand_total"] + 100, "method": "cash"}).status_code == 400
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/payments", json={"amount": 100, "method": "cash", "reference": "TEST"}).status_code == 200
        assert admin.get(f"{B}/api/orders/{o['id']}").json()["payment_status"] == "partial"
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/payments", json={"amount": round(o["grand_total"] - 100, 2), "method": "cash"}).status_code == 200
        assert admin.get(f"{B}/api/orders/{o['id']}").json()["payment_status"] == "paid"
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/refunds", json={"amount": 50, "method": "cash"}).status_code == 200
        d = admin.get(f"{B}/api/orders/{o['id']}").json()
        assert d["payment_status"] == "partial" and abs(d["amount_paid"] - (o["grand_total"] - 50)) < 0.02

    def test_invoice(self, admin, buyer):
        oid = S["order"]["id"]
        r = admin.post(f"{B}/api/admin/orders/{oid}/invoice")
        assert r.status_code == 200, r.text
        inv = r.json()
        assert admin.post(f"{B}/api/admin/orders/{oid}/invoice").status_code == 409
        p = buyer.get(f"{B}/api/invoices/{inv['id']}/pdf")
        assert p.status_code == 200 and p.content[:4] == b"%PDF"
        assert admin.get(f"{B}/api/admin/orders/{oid}/packing-slip").content[:4] == b"%PDF"
        assert admin.post(f"{B}/api/admin/invoices/{inv['id']}/cancel", json={"reason": ""}).status_code == 400
        r = admin.post(f"{B}/api/admin/invoices/{inv['id']}/cancel", json={"reason": "TEST_cancel"})
        assert r.status_code == 200 and r.json()["credit_note"].startswith("CN/")

    def test_return_restock(self, admin, buyer):
        o = S["order"]
        before = admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"]
        r = buyer.post(f"{B}/api/orders/{o['id']}/return", json={"reason": "TEST_return", "items": [{"sku": "SE-RH2-CH", "qty": 1}]})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        assert admin.post(f"{B}/api/admin/returns/{rid}/status", json={"status": "received"}).status_code == 409
        assert admin.post(f"{B}/api/admin/returns/{rid}/status", json={"status": "approved"}).status_code == 200
        assert admin.post(f"{B}/api/admin/returns/{rid}/status", json={"status": "received"}).status_code == 200
        assert admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"] == before + 1

    def test_cancel_restocks(self, admin):
        o = S["bt_order"]
        before = admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"]
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/status", json={"status": "cancelled", "note": "TEST"}).status_code == 200
        assert admin.get(f"{B}/api/products/by-sku/SE-RH2-CH").json()["variant"]["stock"] == before + 1
        assert admin.post(f"{B}/api/admin/orders/{o['id']}/invoice").status_code == 409


# ---------- Dealer / negotiated pricing ----------
class TestB2BPricing:
    def test_dealer_and_negotiated(self, admin, buyer, anon):
        cid = S["buyer_cid"]
        prods = admin.get(f"{B}/api/admin/products", params={"q": "SE-TR24"}).json()["items"]
        v = next(v for p in prods for v in p["variants"] if v["sku"] == "SE-TR24-BS")
        dealer = v.get("dealer")
        assert dealer, "SE-TR24-BS has no dealer price"
        try:
            assert admin.post(f"{B}/api/admin/customers/{cid}/approval", json={"decision": "approve", "price_group": "dealer"}).status_code == 200
            bv = buyer.get(f"{B}/api/products/sample-tribeca-towel-rail-24").json()["product"]["variants"][0]
            assert bv["price"] == dealer and bv["rule"] == "contract:dealer" and not (LEAK & set(bv))
            assert anon.get(f"{B}/api/products/sample-tribeca-towel-rail-24").json()["product"]["variants"][0]["price"] == 1450
            assert admin.post(f"{B}/api/admin/customers/{cid}/prices", json={"sku": "SE-TR24-BS", "price": 999}).status_code == 200
            bv = buyer.get(f"{B}/api/products/sample-tribeca-towel-rail-24").json()["product"]["variants"][0]
            assert bv["price"] == 999 and bv["rule"] == "negotiated"
            assert buyer.get(f"{B}/api/my/pricelist.pdf").content[:4] == b"%PDF"
        finally:
            admin.delete(f"{B}/api/admin/customers/{cid}/prices/SE-TR24-BS")
            admin.post(f"{B}/api/admin/customers/{cid}/approval", json={"decision": "approve", "price_group": "retail"})
        assert buyer.get(f"{B}/api/products/sample-tribeca-towel-rail-24").json()["product"]["variants"][0]["price"] == 1450


# ---------- Quotations ----------
class TestQuotes:
    def test_quote_flow(self, admin, buyer, sales):
        cid = S["buyer_cid"]
        body = {"customer_id": cid, "items": [{"sku": "SE-RH2-CH", "qty": 10, "discount_pct": 5}], "notes": "TEST_quote", "ship_state": "Gujarat"}
        assert sales.post(f"{B}/api/admin/quotations", json={**body, "items": [{"sku": "SE-RH2-CH", "qty": 10, "discount_pct": 15}]}).status_code == 403
        r = sales.post(f"{B}/api/admin/quotations", json=body)
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        q = admin.get(f"{B}/api/admin/quotations/{qid}").json()
        assert q["status"] == "draft" and q["subtotal"] == round(390 * 10 * 0.95, 2)
        assert not any(x["id"] == qid for x in buyer.get(f"{B}/api/my/quotations").json())
        assert admin.put(f"{B}/api/admin/quotations/{qid}", json={**body, "items": [{"sku": "SE-RH2-CH", "qty": 20}]}).status_code == 200
        assert admin.get(f"{B}/api/admin/quotations/{qid}").json()["subtotal"] == 7800
        assert admin.post(f"{B}/api/admin/quotations/{qid}/status", json={"status": "sent"}).status_code == 200
        assert admin.put(f"{B}/api/admin/quotations/{qid}", json=body).status_code == 409
        mine = buyer.get(f"{B}/api/my/quotations").json()
        mq = next(x for x in mine if x["id"] == qid)
        assert "internal_notes" not in mq and all("cost" not in l for l in mq["lines"])
        assert buyer.get(f"{B}/api/quotations/{qid}/pdf").content[:4] == b"%PDF"
        assert buyer.get(f"{B}/api/quotations/{qid}/pdf", params={"proforma": "true"}).content[:4] == b"%PDF"
        assert buyer.post(f"{B}/api/my/quotations/{qid}/respond", json={"action": "accept"}).status_code == 200
        r = admin.post(f"{B}/api/admin/quotations/{qid}/convert")
        assert r.status_code == 200, r.text
        S["quote_order"] = r.json()
        assert admin.post(f"{B}/api/admin/quotations/{qid}/convert").status_code == 409
        d = admin.post(f"{B}/api/admin/quotations/{qid}/duplicate")
        assert d.status_code == 200 and d.json()["id"] != qid
        admin.post(f"{B}/api/admin/orders/{S['quote_order']['order_id']}/status", json={"status": "cancelled", "note": "TEST cleanup"})


# ---------- Inventory ----------
class TestInventory:
    def test_adjust(self, admin):
        st = lambda: admin.get(f"{B}/api/products/by-sku/SE-WC1-CH").json()["variant"]["stock"]
        s0 = st()
        assert admin.post(f"{B}/api/admin/inventory/adjust", json={"sku": "SE-WC1-CH", "type": "receipt", "qty": 5, "note": "TEST"}).status_code == 200
        assert st() == s0 + 5
        assert admin.post(f"{B}/api/admin/inventory/adjust", json={"sku": "SE-WC1-CH", "type": "reduction", "qty": 99999}).status_code == 409
        assert admin.post(f"{B}/api/admin/inventory/adjust", json={"sku": "SE-WC1-CH", "type": "reduction", "qty": 5, "note": "TEST"}).status_code == 200
        assert admin.post(f"{B}/api/admin/inventory/adjust", json={"sku": "SE-WC1-CH", "type": "count", "qty": s0, "note": "TEST"}).status_code == 200
        assert st() == s0
        inv = admin.get(f"{B}/api/admin/inventory").json()
        assert inv["valuation"] == round(sum(r["value"] for r in inv["items"]), 2) and inv["valuation"] > 0


# ---------- Products / categories admin ----------
class TestProductsAdmin:
    def test_product_crud(self, admin, anon):
        cat = admin.post(f"{B}/api/admin/categories", json={"name": "TEST_Cat " + uuid.uuid4().hex[:4], "attributes": ["Material"]})
        assert cat.status_code == 200, cat.text
        cat = cat.json()
        sub = admin.post(f"{B}/api/admin/categories", json={"name": "TEST_Sub " + uuid.uuid4().hex[:4], "parent_id": cat["id"]}).json()
        sku = "TEST-" + uuid.uuid4().hex[:6].upper()
        body = {"name": "TEST_Product", "category_id": sub["id"], "is_published": True, "attributes": {"Material": "SS 304"},
                "variants": [{"sku": sku, "retail": 500, "mrp": 600, "dealer": 400, "cost": 250, "stock": 12}]}
        r = admin.post(f"{B}/api/admin/products", json=body)
        assert r.status_code == 200, r.text
        pid, slug = r.json()["id"], r.json()["slug"]
        S["test_pid"] = pid
        mv = admin.get(f"{B}/api/admin/inventory/movements", params={"sku": sku}).json()
        assert mv and mv[0]["type"] == "opening" and mv[0]["qty"] == 12
        assert admin.post(f"{B}/api/admin/products", json=body).status_code == 409
        assert anon.get(f"{B}/api/products", params={"category": cat["slug"]}).json()["total"] == 1
        body["slug"] = slug  # NOTE: without slug, PUT re-slugifies name and 409s when slug was auto-suffixed
        body["variants"][0]["retail"] = 550
        body["variants"][0]["stock"] = 999
        assert admin.put(f"{B}/api/admin/products/{pid}", json=body).status_code == 200
        p = admin.get(f"{B}/api/admin/products/{pid}").json()
        assert p["variants"][0]["retail"] == 550 and p["variants"][0]["stock"] == 12
        assert any(h["field"] == "retail" and h["new"] == 550 for h in p["price_history"])
        audit = admin.get(f"{B}/api/admin/audit", params={"entity": "product"}).json()
        assert any(a["action"] == "price_change" and a["entity_id"] == pid for a in audit)
        d = admin.post(f"{B}/api/admin/products/{pid}/duplicate")
        assert d.status_code == 200
        admin.post(f"{B}/api/admin/products/{d.json()['id']}/status", json={"status": "archived"})
        assert admin.delete(f"{B}/api/admin/categories/{sub['id']}").status_code == 409
        assert admin.delete(f"{B}/api/admin/categories/{cat['id']}").status_code == 409
        assert admin.post(f"{B}/api/admin/products/{pid}/status", json={"status": "archived"}).status_code == 200
        assert anon.get(f"{B}/api/products/{slug}").status_code == 404
        assert admin.post(f"{B}/api/admin/products/{pid}/status", json={"status": "active", "is_published": False}).status_code == 200
        assert anon.get(f"{B}/api/products/{slug}").status_code == 404
        csv = admin.get(f"{B}/api/admin/products/export.csv")
        assert csv.status_code == 200 and sku in csv.text and "cost" in csv.text.splitlines()[0]
        admin.post(f"{B}/api/admin/products/{pid}/status", json={"status": "archived"})


# ---------- Reports / dashboard ----------
class TestReports:
    def test_reports(self, admin):
        for g in ("month", "product", "category"):
            r = admin.get(f"{B}/api/admin/reports/sales", params={"group": g})
            assert r.status_code == 200, (g, r.text)
        S["report_month"] = admin.get(f"{B}/api/admin/reports/sales", params={"group": "month"}).json()
        S["dash"] = admin.get(f"{B}/api/admin/dashboard").json()
        assert S["dash"]
