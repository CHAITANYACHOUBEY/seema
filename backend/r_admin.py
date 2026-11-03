import csv
import io
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from core import (IN_ENV, PERMS, RANK, ROLES, audit, current_member, db, effective_role, fin_year, get_setting, give_stock,
                  has_perm, new_id, next_number, now, record_movement, require_perm, take_stock)
from pdfs import business_pdf, catalogue_pdf
from pricing import compute, negotiated_map, public_price, r2
from r_shop import _pdf, apply_payment, cancel_order, notify, place_order

router = APIRouter(prefix="/api/admin")
ACTIVE = {"$nin": ["cancelled", "pending_payment"]}


def csv_response(rows, cols, name):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c, "") for c in cols])
    return Response(out.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


def date_range(frm: str, to: str):
    q = {}
    if frm:
        q["$gte"] = frm
    if to:
        q["$lte"] = to + "T23:59:59"
    return q


# ---------------- Dashboard ----------------
@router.get("/dashboard")
async def dashboard(frm: str = "", to: str = "", member=Depends(require_perm("dashboard"))):
    q = {"status": ACTIVE}
    if frm or to:
        q["created_at"] = date_range(frm, to)
    orders = await db.orders.find(q, {"_id": 0, "grand_total": 1, "created_at": 1, "channel": 1, "lines": 1, "amount_paid": 1}).to_list(20000)
    today = now()[:10]
    revenue = sum(o["grand_total"] for o in orders)
    collected = sum(o.get("amount_paid", 0) for o in orders)
    months = {}
    for i in range(11, -1, -1):
        d = (datetime.now(timezone.utc).replace(day=15) - timedelta(days=30 * i)).strftime("%Y-%m")
        months[d] = {"month": d, "retail": 0, "wholesale": 0}
    channels, top = {}, {}
    all_orders = await db.orders.find({"status": ACTIVE}, {"_id": 0, "grand_total": 1, "created_at": 1, "channel": 1}).to_list(20000)
    for o in all_orders:
        m = o["created_at"][:7]
        if m in months:
            months[m]["retail" if o["channel"] == "retail" else "wholesale"] += o["grand_total"]
    for o in orders:
        key = "Retail" if o["channel"] == "retail" else "Wholesale/B2B"
        channels[key] = channels.get(key, 0) + o["grand_total"]
        for l in o["lines"]:
            t = top.setdefault(l["sku"], {"sku": l["sku"], "name": l["name"], "qty": 0, "revenue": 0})
            t["qty"] += l["qty"]
            t["revenue"] += l["taxable"]
    inv = await db.invoices.find({"status": "issued"}, {"_id": 0, "grand_total": 1, "amount_paid": 1}).to_list(20000)
    low = []
    async for p in db.products.find({"status": "active"}, {"_id": 0, "name": 1, "id": 1, "variants": 1}):
        for v in p["variants"]:
            if (v.get("stock") or 0) <= (v.get("reorder_level") or 0):
                low.append({"product_id": p["id"], "name": p["name"], "sku": v["sku"], "stock": v.get("stock", 0), "reorder_level": v.get("reorder_level", 0)})
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    return {
        "kpis": {"total_orders": len(orders), "today_orders": await db.orders.count_documents({"created_at": {"$gte": today}, "status": ACTIVE}),
                 "revenue": r2(revenue), "collected": r2(collected),
                 "outstanding": r2(sum(o["grand_total"] - o.get("amount_paid", 0) for o in orders)),
                 "invoices_unpaid": r2(sum(i["grand_total"] - i.get("amount_paid", 0) for i in inv)),
                 "new_customers": await db.customers.count_documents({"created_at": {"$gte": since}}),
                 "pending_quotations": await db.quotations.count_documents({"status": {"$in": ["draft", "sent"]}}),
                 "awaiting_processing": await db.orders.count_documents({"status": {"$in": ["confirmed", "processing"]}}),
                 "pending_approvals": await db.customers.count_documents({"status": "pending"}),
                 "low_stock": len(low), "new_enquiries": await db.enquiries.count_documents({"status": "new"})},
        "monthly": [{**m, "retail": r2(m["retail"]), "wholesale": r2(m["wholesale"])} for m in months.values()],
        "channels": [{"name": k, "value": r2(v)} for k, v in channels.items()],
        "top_products": sorted(top.values(), key=lambda t: -t["revenue"])[:6],
        "low_stock": low[:10],
        "recent_enquiries": await db.enquiries.find({}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6),
        "recent_activity": await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).limit(8).to_list(8)}


# ---------------- Customers ----------------
class CustomerIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    business_name: str = ""
    gstin: str = ""
    customer_type: str = "retail"
    addresses: list = []
    sales_rep: str = ""
    notes: str = ""
    follow_up: str = ""
    price_group: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms: Optional[str] = None
    status: Optional[str] = None


GUARDED = ("price_group", "credit_limit", "payment_terms", "status")


@router.get("/customers")
async def customers(q: str = "", type: str = "", status: str = "", page: int = 1, limit: int = 50, export: bool = False,
                    member=Depends(require_perm("customers.view"))):
    query = {}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}, {"phone": rx}, {"business_name": rx}, {"gstin": rx}]
    if type:
        query["customer_type"] = type
    if status:
        query["status"] = status
    proj = {"_id": 0} if has_perm(member, "customers.approve") else {"_id": 0, "notes": 0, "credit_limit": 0}
    if export:
        rows = await db.customers.find(query, proj).to_list(20000)
        return csv_response(rows, ["name", "business_name", "email", "phone", "gstin", "customer_type", "price_group", "status", "created_at"], "customers")
    total = await db.customers.count_documents(query)
    items = await db.customers.find(query, proj).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": items, "total": total}


@router.post("/customers")
async def create_customer(body: CustomerIn, member=Depends(require_perm("customers.edit"))):
    data = body.model_dump()
    if not has_perm(member, "customers.approve"):
        for k in GUARDED:
            data[k] = None
    doc = {**data, "id": new_id(), "user_id": None, "price_group": data["price_group"] or "retail", "status": data["status"] or "active",
           "credit_limit": data["credit_limit"] or 0, "payment_terms": data["payment_terms"] or "", "created_at": now(), "source": "admin"}
    await db.customers.insert_one(doc)
    await audit(member, "create", "customer", doc["id"], {"name": body.name})
    doc.pop("_id", None)
    return doc


@router.get("/customers/{cid}")
async def customer_detail(cid: str, member=Depends(require_perm("customers.view"))):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if not has_perm(member, "customers.approve"):
        c.pop("notes", None)
        c.pop("credit_limit", None)
    orders = await db.orders.find({"customer_id": cid}, {"_id": 0, "lines": 0}).sort("created_at", -1).to_list(100)
    invoices = await db.invoices.find({"customer_id": cid}, {"_id": 0, "lines": 0}).sort("created_at", -1).to_list(100)
    quotes = await db.quotations.find({"customer_id": cid}, {"_id": 0, "lines": 0}).sort("created_at", -1).to_list(100)
    prices = await db.customer_prices.find({"customer_id": cid}, {"_id": 0}).to_list(1000) if has_perm(member, "prices.view_wholesale") else []
    outstanding = sum(i["grand_total"] - i.get("amount_paid", 0) for i in invoices if i["status"] == "issued")
    changes = await db.audit_logs.find({"entity": "customer", "entity_id": cid}, {"_id": 0}).sort("at", -1).to_list(30)
    return {"customer": c, "orders": orders, "invoices": invoices, "quotations": quotes, "prices": prices,
            "outstanding": r2(outstanding), "changes": changes}


@router.put("/customers/{cid}")
async def update_customer(cid: str, body: CustomerIn, member=Depends(require_perm("customers.edit"))):
    old = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Customer not found")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not has_perm(member, "customers.approve"):
        for k in GUARDED + ("notes",):
            data.pop(k, None)
    changed = {k: {"old": old.get(k), "new": v} for k, v in data.items() if old.get(k) != v}
    await db.customers.update_one({"id": cid}, {"$set": data})
    await audit(member, "update", "customer", cid, changed)
    return {"ok": True}


class ApproveIn(BaseModel):
    decision: str
    price_group: str = "wholesale"
    credit_limit: float = 0
    payment_terms: str = ""
    note: str = ""


@router.post("/customers/{cid}/approval")
async def approve_customer(cid: str, body: ApproveIn, member=Depends(require_perm("customers.approve"))):
    c = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Customer not found")
    if body.decision == "approve":
        if body.price_group not in ("retail", "wholesale", "dealer", "distributor"):
            raise HTTPException(400, "Invalid price group")
        ctype = (c.get("application") or {}).get("customer_type") or c.get("customer_type")
        sets = {"status": "approved", "price_group": body.price_group, "customer_type": ctype,
                "credit_limit": body.credit_limit, "payment_terms": body.payment_terms}
    elif body.decision == "reject":
        sets = {"status": "rejected"}
    elif body.decision == "deactivate":
        sets = {"status": "inactive"}
    else:
        raise HTTPException(400, "Invalid decision")
    await db.customers.update_one({"id": cid}, {"$set": {**sets, "approval_note": body.note, "approved_by": member["email"], "approved_at": now()}})
    await notify(c.get("user_id"), "Business account " + sets["status"], body.note or "Your account status was updated.", "/account")
    await audit(member, "approval:" + body.decision, "customer", cid, sets)
    return {"ok": True}


class CustPriceIn(BaseModel):
    sku: str
    price: float


@router.post("/customers/{cid}/prices")
async def set_customer_price(cid: str, body: CustPriceIn, member=Depends(require_perm("prices.edit"))):
    if not await db.customers.find_one({"id": cid}, {"_id": 1}):
        raise HTTPException(404, "Customer not found")
    if not await db.products.find_one({"variants.sku": body.sku}):
        raise HTTPException(404, "SKU not found")
    if body.price <= 0:
        raise HTTPException(400, "Price must be greater than zero")
    await db.customer_prices.update_one({"customer_id": cid, "sku": body.sku}, {"$set": {"price": r2(body.price), "by": member["email"], "at": now()}}, upsert=True)
    await db.price_history.insert_one({"id": new_id(), "sku": body.sku, "field": f"negotiated:{cid}", "new": body.price, "at": now(), "by": member["email"], "source": "negotiated"})
    await audit(member, "negotiated_price", "customer", cid, body.model_dump())
    return {"ok": True}


@router.delete("/customers/{cid}/prices/{sku}")
async def del_customer_price(cid: str, sku: str, member=Depends(require_perm("prices.edit"))):
    await db.customer_prices.delete_one({"customer_id": cid, "sku": sku})
    await audit(member, "negotiated_price_removed", "customer", cid, {"sku": sku})
    return {"ok": True}


# ---------------- Orders, payments, invoices ----------------
@router.get("/orders")
async def admin_orders(status: str = "", q: str = "", channel: str = "", page: int = 1, limit: int = 50, member=Depends(require_perm("orders.view"))):
    query = {}
    if status:
        query["status"] = status
    if channel:
        query["channel"] = "retail" if channel == "retail" else {"$ne": "retail"}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        query["$or"] = [{"number": rx}, {"customer.name": rx}, {"customer.email": rx}, {"customer.business_name": rx}]
    total = await db.orders.count_documents(query)
    items = await db.orders.find(query, {"_id": 0, "lines": 0, "history": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": items, "total": total}


FLOW = {"confirmed": ["processing", "cancelled"], "processing": ["packed", "cancelled"], "packed": ["shipped", "cancelled"],
        "shipped": ["delivered"], "delivered": [], "pending_payment": ["cancelled"], "cancelled": [], "returned": []}


class OrderStatusIn(BaseModel):
    status: str
    courier: str = ""
    tracking_number: str = ""
    tracking_url: str = ""
    note: str = ""


@router.post("/orders/{oid}/status")
async def order_status(oid: str, body: OrderStatusIn, member=Depends(require_perm("orders.edit"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if body.status not in FLOW.get(o["status"], []):
        raise HTTPException(409, f"Cannot move order from {o['status']} to {body.status}")
    if body.status == "cancelled":
        await cancel_order(o, member, body.note or "Cancelled by staff")
    else:
        sets = {"status": body.status}
        if body.status == "shipped":
            sets["shipment"] = {"courier": body.courier, "tracking_number": body.tracking_number, "tracking_url": body.tracking_url, "shipped_at": now()}
        if body.status == "delivered":
            sets["shipment.delivered_at"] = now()
        await db.orders.update_one({"id": oid}, {"$set": sets, "$push": {"history": {"status": body.status, "at": now(), "by": member["email"], "note": body.note}}})
        await audit(member, "status:" + body.status, "order", oid)
    await notify(o.get("user_id"), f"Order {o['number']} is {body.status}", body.note or (f"{body.courier} {body.tracking_number}".strip()), f"/account/orders/{oid}")
    return {"ok": True}


class PaymentIn(BaseModel):
    amount: float
    method: str
    reference: str = ""


@router.post("/orders/{oid}/payments")
async def record_payment(oid: str, body: PaymentIn, member=Depends(require_perm("payments.record"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    due = r2(o["grand_total"] - o["amount_paid"])
    if body.amount <= 0 or body.amount > due + 0.01:
        raise HTTPException(400, f"Amount must be between 0 and the balance due (₹{due:,.2f})")
    await apply_payment(o, body.amount, body.method, body.reference, by=member["email"])
    await audit(member, "payment_recorded", "order", oid, body.model_dump())
    return {"ok": True}


@router.post("/orders/{oid}/refunds")
async def record_refund(oid: str, body: PaymentIn, member=Depends(require_perm("payments.record"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o or body.amount <= 0 or body.amount > o["amount_paid"] + 0.01:
        raise HTTPException(400, "Refund cannot exceed the amount paid")
    await db.payments.insert_one({"id": new_id(), "order_id": oid, "order_number": o["number"], "customer_id": o["customer_id"], "amount": -r2(body.amount),
                                  "method": body.method, "reference": body.reference, "type": "refund", "at": now(), "by": member["email"]})
    paid = r2(o["amount_paid"] - body.amount)
    await db.orders.update_one({"id": oid}, {"$set": {"amount_paid": paid, "payment_status": "refunded" if paid <= 0 else "partial", "refund_due": False}})
    await audit(member, "refund_recorded", "order", oid, body.model_dump())
    return {"ok": True}


@router.get("/orders/{oid}/packing-slip")
async def packing_slip(oid: str, member=Depends(require_perm("orders.view"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    party = {**o["customer"], "address": o["address"]}
    data = await run_in_threadpool(business_pdf, "PACKING SLIP", o["number"], await get_setting("company"), party,
                                   [("Order", o["number"]), ("Date", o["created_at"][:10])], o, o.get("notes", ""), False)
    return _pdf(data, "packing-" + o["number"])


@router.post("/orders/{oid}/invoice")
async def make_invoice(oid: str, member=Depends(require_perm("invoices.edit"))):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o or o["status"] in ("cancelled", "pending_payment"):
        raise HTTPException(409, "Invoices can only be generated for confirmed orders")
    if await db.invoices.find_one({"order_id": oid, "status": "issued"}):
        raise HTTPException(409, "An invoice already exists for this order")
    company = await get_setting("company")
    commerce = await get_setting("commerce")
    fy = fin_year()
    number = await next_number(f"invoice-{fy}", f"{commerce.get('invoice_prefix', 'SE/')}{fy}/", 4)
    party = {**o["customer"], "address": o["address"]}
    inv = {"id": new_id(), "number": number, "order_id": oid, "order_number": o["number"], "customer_id": o["customer_id"],
           "company": company, "party": party, "lines": [{k: v for k, v in l.items() if k != "cost"} for l in o["lines"]],
           **{k: o[k] for k in ("subtotal", "discount", "taxable", "cgst", "sgst", "igst", "tax", "shipping", "grand_total", "payment_method")},
           "amount_paid": o["amount_paid"], "status": "issued", "created_at": now(), "by": member["email"]}
    await db.invoices.insert_one(inv)
    await audit(member, "invoice_issued", "invoice", inv["id"], {"number": number, "order": o["number"]})
    await notify(o.get("user_id"), f"Invoice {number} issued", f"For order {o['number']}", f"/account/orders/{oid}")
    return {"id": inv["id"], "number": number}


@router.get("/invoices")
async def invoices(q: str = "", status: str = "", member=Depends(require_perm("invoices.view"))):
    query = {}
    if status:
        query["status"] = status
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        query["$or"] = [{"number": rx}, {"order_number": rx}, {"party.name": rx}, {"party.business_name": rx}]
    items = await db.invoices.find(query, {"_id": 0, "lines": 0, "company": 0}).sort("created_at", -1).to_list(500)
    notes = await db.credit_notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items, "credit_notes": notes}


@router.post("/invoices/{iid}/cancel")
async def cancel_invoice(iid: str, body: dict, member=Depends(require_perm("invoices.edit"))):
    inv = await db.invoices.find_one({"id": iid, "status": "issued"}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Issued invoice not found")
    reason = str(body.get("reason", "")).strip()
    if not reason:
        raise HTTPException(400, "A reason is required")
    cn = {"id": new_id(), "number": await next_number(f"cn-{fin_year()}", f"CN/{fin_year()}/", 4), "invoice_id": iid,
          "invoice_number": inv["number"], "customer_id": inv["customer_id"], "amount": inv["grand_total"], "reason": reason,
          "created_at": now(), "by": member["email"]}
    await db.credit_notes.insert_one(cn)
    await db.invoices.update_one({"id": iid}, {"$set": {"status": "cancelled", "credit_note": cn["number"]}})
    await audit(member, "invoice_cancelled", "invoice", iid, {"credit_note": cn["number"], "reason": reason})
    return {"ok": True, "credit_note": cn["number"]}


# ---------------- Quotations ----------------
class QuoteIn(BaseModel):
    customer_id: str
    items: list[dict]
    shipping: float = 0
    validity_days: int = 15
    delivery_terms: str = ""
    payment_terms: str = ""
    notes: str = ""
    internal_notes: str = ""
    ship_state: str = ""
    enquiry_id: str = ""


async def _build_quote(body: QuoteIn, member):
    c = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(400, "Select a customer")
    commerce = await get_setting("commerce")
    if any(float(i.get("discount_pct") or 0) > float(commerce.get("max_staff_discount", 10)) for i in body.items) and not has_perm(member, "discounts.approve"):
        raise HTTPException(403, f"Discounts above {commerce.get('max_staff_discount', 10)}% need a manager's approval")
    if any(not 0 <= float(i.get("discount_pct") or 0) <= 100 for i in body.items):
        raise HTTPException(400, "Discount must be between 0 and 100%")
    state = body.ship_state or next((a.get("state") for a in c.get("addresses") or [] if a.get("state")), "")
    priced = await compute([{"sku": i["sku"], "qty": int(i["qty"]), "discount_pct": float(i.get("discount_pct") or 0)} for i in body.items],
                           c, state, check_stock=False, shipping=body.shipping)
    if not priced["lines"]:
        raise HTTPException(400, "Add at least one valid product")
    blocking = [e for e in priced["errors"] if "Minimum" in e["error"] or "available" in e["error"]]
    if blocking:
        raise HTTPException(409, {"errors": blocking})
    party = {k: c.get(k) for k in ("name", "business_name", "email", "phone", "gstin")}
    party["address"] = next(iter(c.get("addresses") or []), {"state": state})
    valid = (datetime.now(timezone.utc) + timedelta(days=body.validity_days)).date().isoformat()
    return c, {**{k: priced[k] for k in ("lines", "subtotal", "discount", "taxable", "cgst", "sgst", "igst", "tax", "shipping", "grand_total", "inter_state")},
               "customer_id": c["id"], "party": party, "valid_until": valid, **body.model_dump(exclude={"items", "customer_id"})}


@router.get("/quotations")
async def quotations(status: str = "", q: str = "", member=Depends(require_perm("quotations.edit"))):
    query = {}
    if status:
        query["status"] = status
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        query["$or"] = [{"number": rx}, {"party.name": rx}, {"party.business_name": rx}]
    await db.quotations.update_many({"status": "sent", "valid_until": {"$lt": now()[:10]}}, {"$set": {"status": "expired"}})
    return await db.quotations.find(query, {"_id": 0, "lines": 0}).sort("created_at", -1).to_list(500)


@router.get("/quotations/{qid}")
async def quotation(qid: str, member=Depends(require_perm("quotations.edit"))):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    return q


@router.post("/quotations")
async def create_quote(body: QuoteIn, member=Depends(require_perm("quotations.edit"))):
    c, data = await _build_quote(body, member)
    doc = {**data, "id": new_id(), "number": await next_number(f"quote-{fin_year()}", f"QT/{fin_year()}/", 4), "status": "draft",
           "created_by": member["email"], "created_at": now(), "history": [{"status": "draft", "at": now(), "by": member["email"]}]}
    await db.quotations.insert_one(doc)
    if body.enquiry_id:
        await db.enquiries.update_one({"id": body.enquiry_id}, {"$set": {"status": "quoted", "quotation_id": doc["id"]}})
    await audit(member, "create", "quotation", doc["id"], {"number": doc["number"], "total": doc["grand_total"]})
    return {"id": doc["id"], "number": doc["number"]}


@router.put("/quotations/{qid}")
async def update_quote(qid: str, body: QuoteIn, member=Depends(require_perm("quotations.edit"))):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q or q["status"] != "draft":
        raise HTTPException(409, "Only draft quotations can be edited")
    _, data = await _build_quote(body, member)
    await db.quotations.update_one({"id": qid}, {"$set": {**data, "updated_at": now()}})
    await audit(member, "update", "quotation", qid)
    return {"ok": True}


class QStatusIn(BaseModel):
    status: str


@router.post("/quotations/{qid}/status")
async def quote_status(qid: str, body: QStatusIn, member=Depends(require_perm("quotations.edit"))):
    allowed = {"draft": ["sent", "cancelled"], "sent": ["accepted", "rejected", "cancelled", "expired"], "accepted": ["cancelled"]}
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q or body.status not in allowed.get(q["status"], []):
        raise HTTPException(409, "This status change is not allowed")
    await db.quotations.update_one({"id": qid}, {"$set": {"status": body.status}, "$push": {"history": {"status": body.status, "at": now(), "by": member["email"]}}})
    if body.status == "sent":
        c = await db.customers.find_one({"id": q["customer_id"]}, {"_id": 0, "user_id": 1})
        await notify((c or {}).get("user_id"), f"Quotation {q['number']} from Seema Enterprise", f"Total ₹{q['grand_total']:,.2f}", "/account")
    await audit(member, "status:" + body.status, "quotation", qid)
    return {"ok": True}


@router.post("/quotations/{qid}/duplicate")
async def dup_quote(qid: str, member=Depends(require_perm("quotations.edit"))):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    body = QuoteIn(customer_id=q["customer_id"], items=[{"sku": l["sku"], "qty": l["qty"], "discount_pct": l.get("discount_pct", 0)} for l in q["lines"]],
                   shipping=q.get("shipping", 0), validity_days=q.get("validity_days", 15), delivery_terms=q.get("delivery_terms", ""),
                   payment_terms=q.get("payment_terms", ""), notes=q.get("notes", ""), ship_state=q.get("ship_state", ""))
    return await create_quote(body, member)


@router.post("/quotations/{qid}/convert")
async def convert_quote(qid: str, member=Depends(require_perm("quotations.edit"))):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    if not q or q["status"] != "accepted":
        raise HTTPException(409, "Only accepted quotations can be converted")
    if q.get("order_id"):
        raise HTTPException(409, "Already converted")
    c = await db.customers.find_one({"id": q["customer_id"]}, {"_id": 0})
    address = q["party"].get("address") or {}
    order = await place_order(member, c, {**q, "coupon": None}, address, "bank_transfer", q.get("notes", ""), "quotation", qid)
    await db.quotations.update_one({"id": qid}, {"$set": {"order_id": order["id"], "status": "accepted"}})
    await audit(member, "converted", "quotation", qid, {"order": order["number"]})
    return {"order_id": order["id"], "number": order["number"]}


# ---------------- Inventory ----------------
@router.get("/inventory")
async def inventory(q: str = "", low: bool = False, export: bool = False, member=Depends(require_perm("inventory.view"))):
    rows = []
    async for p in db.products.find({"status": "active"}, {"_id": 0}):
        for v in p["variants"]:
            if q and q.lower() not in (p["name"] + v["sku"]).lower():
                continue
            if low and (v.get("stock") or 0) > (v.get("reorder_level") or 0):
                continue
            rows.append({"product_id": p["id"], "name": p["name"], "variant": v.get("name"), "sku": v["sku"], "stock": v.get("stock", 0),
                         "reorder_level": v.get("reorder_level", 0), "cost": v.get("cost", 0), "value": r2((v.get("stock") or 0) * (v.get("cost") or 0))})
    if export:
        return csv_response(rows, ["sku", "name", "variant", "stock", "reorder_level", "cost", "value"], "inventory")
    return {"items": rows, "valuation": r2(sum(r["value"] for r in rows))}


@router.get("/inventory/movements")
async def movements(sku: str = "", member=Depends(require_perm("inventory.view"))):
    return await db.stock_movements.find({"sku": sku} if sku else {}, {"_id": 0}).sort("at", -1).limit(300).to_list(300)


class AdjustIn(BaseModel):
    sku: str
    type: str
    qty: int
    note: str = ""


@router.post("/inventory/adjust")
async def adjust(body: AdjustIn, member=Depends(require_perm("inventory.edit"))):
    p = await db.products.find_one({"variants.sku": body.sku}, {"_id": 0})
    if not p:
        raise HTTPException(404, "SKU not found")
    v = next(x for x in p["variants"] if x["sku"] == body.sku)
    if body.type == "receipt":
        delta = abs(body.qty)
    elif body.type == "reduction":
        delta = -abs(body.qty)
    elif body.type == "count":
        delta = body.qty - int(v.get("stock") or 0)
    elif body.type == "adjustment":
        delta = body.qty
    else:
        raise HTTPException(400, "Invalid movement type")
    if delta < 0 and not await take_stock(p["id"], body.sku, -delta):
        raise HTTPException(409, "Stock cannot go below zero")
    if delta > 0:
        await give_stock(p["id"], body.sku, delta)
    if delta:
        await record_movement(member, p["id"], body.sku, delta, body.type, "manual", body.note)
    await audit(member, "stock_" + body.type, "inventory", body.sku, {"delta": delta, "note": body.note})
    return {"ok": True, "delta": delta}


# ---------------- Coupons, returns, enquiries ----------------
class CouponIn(BaseModel):
    code: str
    type: str = "percent"
    value: float
    min_order: float = 0
    max_discount: float = 0
    starts: str = ""
    ends: str = ""
    usage_limit: int = 0
    active: bool = True


@router.get("/coupons")
async def coupons(member=Depends(require_perm("coupons.edit"))):
    return await db.coupons.find({}, {"_id": 0}).sort("code", 1).to_list(500)


@router.post("/coupons")
async def save_coupon(body: CouponIn, member=Depends(require_perm("coupons.edit"))):
    if body.type not in ("percent", "flat") or body.value <= 0 or (body.type == "percent" and body.value > 90):
        raise HTTPException(400, "Enter a valid discount")
    code = body.code.strip().upper()
    await db.coupons.update_one({"code": code}, {"$set": {**body.model_dump(), "code": code}, "$setOnInsert": {"used": 0, "id": new_id()}}, upsert=True)
    await audit(member, "save", "coupon", code, body.model_dump())
    return {"ok": True}


@router.delete("/coupons/{code}")
async def del_coupon(code: str, member=Depends(require_perm("coupons.edit"))):
    await db.coupons.update_one({"code": code}, {"$set": {"active": False}})
    return {"ok": True}


@router.get("/returns")
async def returns(member=Depends(require_perm("returns.edit"))):
    return await db.returns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/returns/{rid}/status")
async def return_status(rid: str, body: QStatusIn, member=Depends(require_perm("returns.edit"))):
    flow = {"requested": ["approved", "rejected"], "approved": ["received"], "received": ["closed"]}
    r = await db.returns.find_one({"id": rid}, {"_id": 0})
    if not r or body.status not in flow.get(r["status"], []):
        raise HTTPException(409, "This status change is not allowed")
    await db.returns.update_one({"id": rid}, {"$set": {"status": body.status, "updated_at": now(), "by": member["email"]}})
    if body.status == "received":
        for i in r["items"]:
            await give_stock(i["product_id"], i["sku"], i["qty"])
            await record_movement(member, i["product_id"], i["sku"], i["qty"], "return", r["number"])
    await notify(r.get("user_id"), f"Return {r['number']} {body.status}", f"Order {r['order_number']}", f"/account/orders/{r['order_id']}")
    await audit(member, "return:" + body.status, "return", rid)
    return {"ok": True}


@router.get("/enquiries")
async def enquiries(type: str = "", member=Depends(require_perm("enquiries.view"))):
    return await db.enquiries.find({"type": type} if type else {}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/enquiries/{eid}/status")
async def enquiry_status(eid: str, body: QStatusIn, member=Depends(require_perm("enquiries.view"))):
    await db.enquiries.update_one({"id": eid}, {"$set": {"status": body.status}})
    return {"ok": True}


# ---------------- Settings, content ----------------
@router.get("/settings")
async def settings(member=Depends(require_perm("dashboard"))):
    return {"company": await get_setting("company"), "commerce": await get_setting("commerce")}


@router.put("/settings/{key}")
async def save_settings(key: str, body: dict, member=Depends(require_perm("settings.edit"))):
    if key not in ("company", "commerce"):
        raise HTTPException(400, "Unknown settings group")
    gst = str(body.get("gstin", "")).strip().upper()
    if key == "company" and gst and len(gst) != 15:
        raise HTTPException(400, "GSTIN must be 15 characters")
    await db.settings.update_one({"key": key}, {"$set": {"value": body}}, upsert=True)
    await audit(member, "update", "settings", key)
    return {"ok": True}


@router.put("/content")
async def save_content(body: dict, member=Depends(require_perm("content.edit"))):
    await db.content.update_one({"key": "site"}, {"$set": {"value": body}}, upsert=True)
    await audit(member, "update", "content", "site")
    return {"ok": True}


# ---------------- Staff, audit ----------------
@router.get("/users")
async def users(member=Depends(require_perm("staff.manage"))):
    people = await db.users.find(IN_ENV, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"roles": [r for r in ROLES if RANK[r] <= RANK[member["role"]]], "perms": PERMS,
            "users": [{**p, "role": effective_role(p.get("role"))} for p in people]}


class RoleIn(BaseModel):
    role: str


@router.patch("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, member=Depends(require_perm("staff.manage"))):
    if body.role not in ROLES or RANK[body.role] > RANK[member["role"]]:
        raise HTTPException(403, "Not allowed")
    target = await db.users.find_one({"user_id": user_id, **IN_ENV}, {"_id": 0})
    if target is None:
        raise HTTPException(404, "Not found")
    if effective_role(target.get("role")) == "admin" and body.role != "admin" and await db.users.count_documents({"role": "admin", **IN_ENV}) <= 1:
        raise HTTPException(409, "Keep at least one Super Admin")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
    await audit(member, "role_change", "user", user_id, {"from": target.get("role"), "to": body.role})
    return {"user_id": user_id, "role": body.role}


@router.get("/audit")
async def audit_logs(entity: str = "", member=Depends(require_perm("audit.view"))):
    return await db.audit_logs.find({"entity": entity} if entity else {}, {"_id": 0}).sort("at", -1).limit(500).to_list(500)


# ---------------- Reports & documents ----------------
@router.get("/reports/sales")
async def sales_report(frm: str = "", to: str = "", group: str = "month", export: bool = False, member=Depends(require_perm("reports.view"))):
    q = {"status": ACTIVE}
    if frm or to:
        q["created_at"] = date_range(frm, to)
    orders = await db.orders.find(q, {"_id": 0}).to_list(50000)
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0}).to_list(1000)}
    pcat = {p["id"]: cats.get(p["category_id"], "-") async for p in db.products.find({}, {"id": 1, "category_id": 1, "_id": 0})}
    groups = {}
    for o in orders:
        if group in ("day", "month", "year", "customer", "channel", "employee"):
            key = {"day": o["created_at"][:10], "month": o["created_at"][:7], "year": o["created_at"][:4],
                   "customer": o["customer"].get("business_name") or o["customer"]["name"],
                   "channel": o["channel"], "employee": o["history"][0].get("by", "-") if o.get("source") == "quotation" else "Online"}[group]
            g = groups.setdefault(key, {"key": key, "orders": 0, "revenue": 0, "taxable": 0, "tax": 0, "collected": 0, "discount": 0, "est_margin": 0})
            g["orders"] += 1
            g["revenue"] += o["grand_total"]
            g["taxable"] += o["taxable"]
            g["tax"] += o["tax"]
            g["collected"] += o.get("amount_paid", 0)
            g["discount"] += o.get("discount", 0)
            g["est_margin"] += sum(l["taxable"] - l.get("cost", 0) * l["qty"] for l in o["lines"])
        else:
            for l in o["lines"]:
                key = l["name"] if group == "product" else pcat.get(l["product_id"], "-")
                g = groups.setdefault(key, {"key": key, "orders": 0, "qty": 0, "taxable": 0, "tax": 0, "revenue": 0, "est_margin": 0})
                g["orders"] += 1
                g["qty"] += l["qty"]
                g["taxable"] += l["taxable"]
                g["tax"] += l["tax"]
                g["revenue"] += l["total"]
                g["est_margin"] += l["taxable"] - l.get("cost", 0) * l["qty"]
    rows = sorted(({k: (r2(v) if isinstance(v, float) else v) for k, v in g.items()} for g in groups.values()), key=lambda r: r["key"])
    if export:
        return csv_response(rows, list(rows[0].keys()) if rows else ["key"], f"sales-{group}")
    quotes = await db.quotations.find({}, {"status": 1, "_id": 0}).to_list(20000)
    sent = [x for x in quotes if x["status"] != "draft"]
    return {"rows": rows, "totals": {"revenue": r2(sum(o["grand_total"] for o in orders)), "collected": r2(sum(o.get("amount_paid", 0) for o in orders)),
            "outstanding": r2(sum(o["grand_total"] - o.get("amount_paid", 0) for o in orders)),
            "est_margin": r2(sum(r.get("est_margin", 0) for r in rows)) if group not in ("product", "category") else r2(sum(r["est_margin"] for r in rows)),
            "discounts": r2(sum(o.get("discount", 0) for o in orders)),
            "quote_conversion": round(100 * len([x for x in sent if x["status"] == "accepted"]) / len(sent), 1) if sent else 0,
            "cancelled": await db.orders.count_documents({"status": "cancelled"}), "returns": await db.returns.count_documents({})}}


class CatalogueIn(BaseModel):
    title: str = "Product Catalogue"
    category_ids: list[str] = []
    product_ids: list[str] = []
    price_list: str = "none"
    customer_id: str = ""
    include_specs: bool = True


@router.post("/catalogue")
async def build_catalogue(body: CatalogueIn, member=Depends(require_perm("products.view"))):
    q = {"status": "active"}
    if body.product_ids:
        q["id"] = {"$in": body.product_ids}
    elif body.category_ids:
        q["category_id"] = {"$in": body.category_ids}
    docs = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    pl = body.price_list
    if pl in ("wholesale", "dealer", "distributor", "customer", "cost") and not has_perm(member, "prices.view_wholesale"):
        raise HTTPException(403, "You cannot export this price list")
    label, fn = None, None
    if pl in ("mrp", "retail"):
        label, fn = pl.upper(), (lambda p, v: v.get(pl) or 0)
    elif pl in ("wholesale", "dealer", "distributor"):
        label, fn = f"{pl.title()} (excl. GST)", (lambda p, v: v.get(pl) or v.get("retail"))
    elif pl == "customer":
        c = await db.customers.find_one({"id": body.customer_id}, {"_id": 0})
        if not c:
            raise HTTPException(400, "Select a customer")
        neg = await negotiated_map(c)
        label, fn = "Your price", (lambda p, v: public_price(p, v, c, neg)["price"])
    data = await run_in_threadpool(catalogue_pdf, await get_setting("company"), body.title, docs, label, fn, body.include_specs)
    await audit(member, "catalogue_export", "document", "", {"price_list": pl, "products": len(docs)})
    return _pdf(data, "catalogue")
