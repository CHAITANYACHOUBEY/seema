import hashlib
import hmac
import json
import os
import re
import time
from collections import defaultdict
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr
from starlette.concurrency import run_in_threadpool

from core import (audit, current_member, customer_for, db, fin_year, get_setting, give_stock, has_perm, new_id, next_number,
                  now, optional_member, record_movement, take_stock)
from pdfs import business_pdf
from pricing import channel, compute, r2

router = APIRouter(prefix="/api")
_hits = defaultdict(list)


def rate_limit(request: Request, key: str, limit: int = 10, window: int = 3600):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "")).split(",")[0]
    k = f"{key}:{ip}"
    _hits[k] = [t for t in _hits[k] if t > time.time() - window]
    if len(_hits[k]) >= limit:
        raise HTTPException(429, "Too many requests. Please try again later.")
    _hits[k].append(time.time())


def rzp_client():
    kid, sec = os.environ.get("RAZORPAY_KEY_ID"), os.environ.get("RAZORPAY_KEY_SECRET")
    return razorpay.Client(auth=(kid, sec)) if kid and sec else None


async def notify(user_id, title, body, link=""):
    if user_id:
        await db.notifications.insert_one({"id": new_id(), "user_id": user_id, "title": title, "body": body, "link": link, "read": False, "at": now()})


# ---------------- Me / account ----------------
class Address(BaseModel):
    name: str
    phone: str
    line1: str
    line2: str = ""
    city: str
    state: str
    pincode: str


class ProfileIn(BaseModel):
    name: str
    phone: str = ""
    addresses: list[Address] = []


class BusinessIn(BaseModel):
    customer_type: str
    business_name: str
    gstin: str = ""
    phone: str
    city: str = ""
    state: str = ""
    message: str = ""


GSTIN_RX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PUBLIC_CUSTOMER = ("id", "name", "email", "phone", "customer_type", "price_group", "status", "business_name", "gstin",
                   "addresses", "credit_limit", "payment_terms", "application")


@router.get("/me")
async def me(member=Depends(current_member)):
    c = await db.customers.find_one({"user_id": member["user_id"]}, {"_id": 0}) or {}
    from core import PERMS
    return {"user_id": member["user_id"], "email": member.get("email"), "name": member.get("name"), "role": member["role"],
            "perms": PERMS.get(member["role"], []), "customer": {k: c.get(k) for k in PUBLIC_CUSTOMER},
            "channel": channel(c), "unread": await db.notifications.count_documents({"user_id": member["user_id"], "read": False})}


@router.put("/me/profile")
async def update_profile(body: ProfileIn, member=Depends(current_member)):
    await db.customers.update_one({"user_id": member["user_id"]}, {"$set": {"name": body.name, "phone": body.phone,
                                                                            "addresses": [a.model_dump() for a in body.addresses]}})
    return {"ok": True}


@router.post("/me/business")
async def apply_business(body: BusinessIn, member=Depends(current_member)):
    if body.customer_type not in ("wholesale", "dealer", "distributor", "contractor", "builder", "interior_designer", "business"):
        raise HTTPException(400, "Choose a valid business type")
    gst = body.gstin.strip().upper()
    if gst and not GSTIN_RX.match(gst):
        raise HTTPException(400, "GSTIN format looks incorrect (15 characters, e.g. 24ABCDE1234F1Z5)")
    c = await customer_for(member)
    if c.get("status") == "approved" and c.get("customer_type") != "retail":
        raise HTTPException(409, "Your business account is already approved")
    await db.customers.update_one({"user_id": member["user_id"]}, {"$set": {
        "status": "pending", "business_name": body.business_name, "gstin": gst, "phone": body.phone,
        "application": {**body.model_dump(), "gstin": gst, "submitted_at": now()}}})
    await audit(member, "business_application", "customer", c["id"], {"type": body.customer_type})
    return {"ok": True, "status": "pending"}


@router.get("/me/notifications")
async def my_notifications(member=Depends(current_member)):
    items = await db.notifications.find({"user_id": member["user_id"]}, {"_id": 0}).sort("at", -1).to_list(50)
    await db.notifications.update_many({"user_id": member["user_id"]}, {"$set": {"read": True}})
    return items


# ---------------- Wishlist ----------------
@router.get("/wishlist")
async def wishlist(member=Depends(current_member)):
    w = await db.wishlists.find_one({"user_id": member["user_id"]}, {"_id": 0}) or {"product_ids": []}
    prods = await db.products.find({"id": {"$in": w["product_ids"]}, "status": "active"}, {"_id": 0, "id": 1, "name": 1, "slug": 1, "images": 1}).to_list(200)
    return {"product_ids": w["product_ids"], "items": prods}


@router.post("/wishlist/{pid}")
async def toggle_wishlist(pid: str, member=Depends(current_member)):
    w = await db.wishlists.find_one({"user_id": member["user_id"]}) or {"product_ids": []}
    op = "$pull" if pid in w["product_ids"] else "$addToSet"
    await db.wishlists.update_one({"user_id": member["user_id"]}, {op: {"product_ids": pid}}, upsert=True)
    return {"saved": op == "$addToSet"}


# ---------------- Cart ----------------
def owner_key(request: Request, member):
    if member:
        return "u:" + member["user_id"]
    gid = request.headers.get("x-cart-id", "")
    if not re.fullmatch(r"[a-f0-9-]{36}", gid):
        raise HTTPException(400, "Missing cart id")
    return "g:" + gid


async def get_items(owner):
    return (await db.carts.find_one({"owner": owner}, {"_id": 0}) or {}).get("items", [])


async def priced_cart(owner, member, coupon="", state=""):
    items = await get_items(owner)
    res = await compute(items, await customer_for(member), state, coupon)
    for l in res["lines"]:
        l.pop("cost", None)
    res["count"] = sum(i["qty"] for i in items)
    return res


class CartItemIn(BaseModel):
    sku: str
    qty: int
    mode: str = "add"


@router.get("/cart")
async def get_cart(request: Request, coupon: str = "", state: str = "", member=Depends(optional_member)):
    return await priced_cart(owner_key(request, member), member, coupon, state)


@router.post("/cart/items")
async def set_cart_item(body: CartItemIn, request: Request, member=Depends(optional_member)):
    owner = owner_key(request, member)
    if not await db.products.find_one({"variants.sku": body.sku, "status": "active", "is_published": True}):
        raise HTTPException(404, "Product not available")
    items = await get_items(owner)
    cur = next((i for i in items if i["sku"] == body.sku), None)
    qty = (cur["qty"] if cur and body.mode == "add" else 0) + body.qty
    items = [i for i in items if i["sku"] != body.sku]
    if qty > 0:
        items.append({"sku": body.sku, "qty": min(qty, 100000)})
    await db.carts.update_one({"owner": owner}, {"$set": {"items": items, "updated_at": now()}}, upsert=True)
    return await priced_cart(owner, member)


class BulkIn(BaseModel):
    items: list[dict]


@router.post("/cart/bulk")
async def bulk_add(body: BulkIn, request: Request, member=Depends(optional_member)):
    owner = owner_key(request, member)
    items = {i["sku"]: i["qty"] for i in await get_items(owner)}
    missing = []
    for row in body.items[:500]:
        sku, qty = str(row.get("sku", "")).strip(), int(float(row.get("qty") or 0))
        if qty <= 0:
            continue
        if not await db.products.find_one({"variants.sku": sku, "status": "active", "is_published": True}):
            missing.append(sku)
            continue
        items[sku] = items.get(sku, 0) + qty
    await db.carts.update_one({"owner": owner}, {"$set": {"items": [{"sku": k, "qty": v} for k, v in items.items()], "updated_at": now()}}, upsert=True)
    return {"missing": missing, "cart": await priced_cart(owner, member)}


class MergeIn(BaseModel):
    guest_id: str


@router.post("/cart/merge")
async def merge_cart(body: MergeIn, member=Depends(current_member)):
    if not re.fullmatch(r"[a-f0-9-]{36}", body.guest_id):
        raise HTTPException(400, "Invalid cart id")
    guest = await get_items("g:" + body.guest_id)
    owner = "u:" + member["user_id"]
    mine = {i["sku"]: i["qty"] for i in await get_items(owner)}
    for g in guest:
        mine[g["sku"]] = max(mine.get(g["sku"], 0), g["qty"])
    await db.carts.update_one({"owner": owner}, {"$set": {"items": [{"sku": k, "qty": v} for k, v in mine.items()]}}, upsert=True)
    await db.carts.delete_one({"owner": "g:" + body.guest_id})
    return await priced_cart(owner, member)


# ---------------- Orders ----------------
async def place_order(member, customer, priced, address, payment_method, notes="", source="web", quotation_id=None, idem=None):
    taken = []
    cp = priced.get("coupon")
    if cp:
        res = await db.coupons.update_one({"code": cp["code"], "$or": [{"usage_limit": {"$in": [0, None]}}, {"$expr": {"$lt": ["$used", "$usage_limit"]}}]}, {"$inc": {"used": 1}})
        if not res.modified_count:
            raise HTTPException(409, {"errors": [{"sku": "", "error": "Coupon usage limit reached"}]})
    for l in priced["lines"]:
        if not await take_stock(l["product_id"], l["sku"], l["qty"]):
            for pid, sku, q in taken:
                await give_stock(pid, sku, q)
            if cp:
                await db.coupons.update_one({"code": cp["code"]}, {"$inc": {"used": -1}})
            raise HTTPException(409, {"errors": [{"sku": l["sku"], "error": f"{l['name']} just went out of stock. Please update your cart."}]})
        taken.append((l["product_id"], l["sku"], l["qty"]))
    number = await next_number(f"order-{fin_year()}", f"SE-{fin_year()}-")
    status = "pending_payment" if payment_method == "razorpay" else "confirmed"
    order = {"id": new_id(), "number": number, "user_id": customer.get("user_id"), "customer_id": customer["id"],
             "customer": {k: customer.get(k) for k in ("name", "email", "phone", "business_name", "gstin", "customer_type")},
             "channel": channel(customer), "address": address, "lines": priced["lines"],
             **{k: priced[k] for k in ("subtotal", "discount", "coupon", "taxable", "cgst", "sgst", "igst", "tax", "shipping", "grand_total", "inter_state")},
             "payment_method": payment_method, "payment_status": "pending", "amount_paid": 0.0, "status": status,
             "notes": notes, "source": source, "quotation_id": quotation_id, "shipment": {}, "created_at": now(),
             "history": [{"status": status, "at": now(), "by": member.get("email") if member else "system"}]}
    if idem:
        order["idempotency_key"] = idem
    try:
        await db.orders.insert_one(order)
    except Exception:
        for pid, sku, q in taken:
            await give_stock(pid, sku, q)
        if cp:
            await db.coupons.update_one({"code": cp["code"]}, {"$inc": {"used": -1}})
        prev = await db.orders.find_one({"user_id": customer.get("user_id"), "idempotency_key": idem}, {"_id": 0})
        if prev:
            return prev
        raise
    for pid, sku, q in taken:
        await record_movement(member, pid, sku, -q, "sale", number)
    await notify(order["user_id"], f"Order {number} placed", f"Total ₹{order['grand_total']:,.2f}", f"/account/orders/{order['id']}")
    order.pop("_id", None)
    return order


class CheckoutIn(BaseModel):
    address: Address
    payment_method: str
    coupon: str = ""
    notes: str = ""


async def create_rzp_order(order):
    client = rzp_client()
    ro = await run_in_threadpool(client.order.create, {"amount": int(round((order["grand_total"] - order["amount_paid"]) * 100)),
                                                       "currency": "INR", "receipt": order["number"][:40], "payment_capture": 1})
    await db.orders.update_one({"id": order["id"]}, {"$set": {"razorpay_order_id": ro["id"]}})
    return {"key_id": os.environ["RAZORPAY_KEY_ID"], "order_id": ro["id"], "amount": ro["amount"], "currency": "INR"}


@router.post("/checkout")
async def checkout(body: CheckoutIn, request: Request, member=Depends(current_member)):
    idem = request.headers.get("idempotency-key", "")
    if idem:
        prev = await db.orders.find_one({"user_id": member["user_id"], "idempotency_key": idem}, {"_id": 0})
        if prev:
            return {"order": prev}
    customer = await customer_for(member)
    commerce = await get_setting("commerce")
    owner = "u:" + member["user_id"]
    items = await get_items(owner)
    if not items:
        raise HTTPException(400, "Your cart is empty")
    if not re.fullmatch(r"\d{6}", body.address.pincode.strip()):
        raise HTTPException(400, "Enter a valid 6-digit pincode")
    pins = [p.strip() for p in (commerce.get("serviceable_pincodes") or "").split(",") if p.strip()]
    if pins and not any(body.address.pincode.startswith(p) for p in pins):
        raise HTTPException(400, "Sorry, we do not deliver to this pincode yet")
    priced = await compute(items, customer, body.address.state, body.coupon)
    if priced["errors"]:
        raise HTTPException(409, {"errors": priced["errors"]})
    pm = body.payment_method
    if pm == "razorpay" and not rzp_client():
        raise HTTPException(400, "Online payment is not configured yet. Choose another method.")
    if pm == "cod" and (not commerce.get("cod_enabled") or priced["grand_total"] > float(commerce.get("cod_max") or 1e12)):
        raise HTTPException(400, "Cash on Delivery is not available for this order")
    if pm == "bank_transfer" and not commerce.get("bank_transfer_enabled"):
        raise HTTPException(400, "Bank transfer is not available")
    if pm not in ("razorpay", "cod", "bank_transfer"):
        raise HTTPException(400, "Choose a payment method")
    order = await place_order(member, customer, priced, body.address.model_dump(), pm, body.notes, idem=idem or None)
    await db.carts.delete_one({"owner": owner})
    out = {"order": {**order, "lines": [{k: v for k, v in l.items() if k != "cost"} for l in order["lines"]]}}
    if pm == "razorpay":
        try:
            out["razorpay"] = await create_rzp_order(order)
        except Exception:
            out["payment_error"] = "Could not start online payment. You can retry from your orders page."
    return out


async def own_order(oid, member):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o or (o.get("user_id") != member["user_id"] and not has_perm(member, "orders.view")):
        raise HTTPException(404, "Order not found")
    return o


@router.get("/orders")
async def my_orders(member=Depends(current_member)):
    return await db.orders.find({"user_id": member["user_id"]}, {"_id": 0, "lines.cost": 0}).sort("created_at", -1).to_list(200)


@router.get("/orders/{oid}")
async def order_detail(oid: str, member=Depends(current_member)):
    o = await own_order(oid, member)
    o["invoice"] = await db.invoices.find_one({"order_id": oid}, {"_id": 0, "id": 1, "number": 1, "status": 1})
    o["returns"] = await db.returns.find({"order_id": oid}, {"_id": 0}).to_list(20)
    if not has_perm(member, "reports.view"):
        for l in o["lines"]:
            l.pop("cost", None)
    return o


@router.post("/orders/{oid}/pay")
async def retry_pay(oid: str, member=Depends(current_member)):
    o = await own_order(oid, member)
    if o["status"] != "pending_payment" or not rzp_client():
        raise HTTPException(400, "This order cannot be paid online")
    return await create_rzp_order(o)


async def cancel_order(o, member, reason):
    if o["status"] in ("shipped", "delivered", "cancelled", "returned"):
        raise HTTPException(409, f"Order is already {o['status']}")
    res = await db.orders.update_one({"id": o["id"], "status": o["status"]}, {"$set": {"status": "cancelled", "cancel_reason": reason,
                                      "refund_due": o["amount_paid"] > 0}, "$push": {"history": {"status": "cancelled", "at": now(), "by": member["email"], "note": reason}}})
    if res.modified_count:
        for l in o["lines"]:
            await give_stock(l["product_id"], l["sku"], l["qty"])
            await record_movement(member, l["product_id"], l["sku"], l["qty"], "cancel", o["number"])
        inv = await db.invoices.find_one({"order_id": o["id"], "status": "issued"}, {"_id": 0})
        if inv:
            cn = {"id": new_id(), "number": await next_number(f"cn-{fin_year()}", f"CN/{fin_year()}/", 4), "invoice_id": inv["id"],
                  "invoice_number": inv["number"], "customer_id": inv["customer_id"], "amount": inv["grand_total"],
                  "reason": f"Order cancelled: {reason}", "created_at": now(), "by": member["email"]}
            await db.credit_notes.insert_one(cn)
            await db.invoices.update_one({"id": inv["id"]}, {"$set": {"status": "cancelled", "credit_note": cn["number"]}})
        await audit(member, "cancel", "order", o["id"], {"reason": reason})


class ReasonIn(BaseModel):
    reason: str = ""


@router.post("/orders/{oid}/cancel")
async def cancel_my_order(oid: str, body: ReasonIn, member=Depends(current_member)):
    o = await own_order(oid, member)
    if o["status"] not in ("pending_payment", "confirmed"):
        raise HTTPException(409, "This order can no longer be cancelled online. Please contact us.")
    await cancel_order(o, member, body.reason or "Cancelled by customer")
    return {"ok": True}


class ReturnIn(BaseModel):
    reason: str
    items: list[dict]
    kind: str = "return"


@router.post("/orders/{oid}/return")
async def request_return(oid: str, body: ReturnIn, member=Depends(current_member)):
    o = await own_order(oid, member)
    if o["status"] != "delivered":
        raise HTTPException(409, "Returns can be requested after delivery")
    skus = {l["sku"]: l for l in o["lines"]}
    items = [{"sku": i["sku"], "qty": int(i["qty"]), "name": skus[i["sku"]]["name"], "product_id": skus[i["sku"]]["product_id"],
              "unit_total": r2(skus[i["sku"]]["total"] / skus[i["sku"]]["qty"])}
             for i in body.items if i.get("sku") in skus and 0 < int(i.get("qty", 0)) <= skus[i["sku"]]["qty"]]
    if not items:
        raise HTTPException(400, "Select at least one item to return")
    doc = {"id": new_id(), "number": await next_number("return", "RT-", 4), "order_id": oid, "order_number": o["number"],
           "user_id": member["user_id"], "customer_name": o["customer"]["name"], "items": items, "reason": body.reason,
           "kind": body.kind if body.kind in ("return", "replacement") else "return", "status": "requested", "created_at": now()}
    await db.returns.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/orders/{oid}/reorder")
async def reorder(oid: str, member=Depends(current_member)):
    o = await own_order(oid, member)
    owner = "u:" + member["user_id"]
    items = {i["sku"]: i["qty"] for i in await get_items(owner)}
    for l in o["lines"]:
        items[l["sku"]] = items.get(l["sku"], 0) + l["qty"]
    await db.carts.update_one({"owner": owner}, {"$set": {"items": [{"sku": k, "qty": v} for k, v in items.items()]}}, upsert=True)
    return await priced_cart(owner, member)


# ---------------- Payments ----------------
async def apply_payment(order, amount, method, reference, gateway_payment_id=None, by="system"):
    doc = {"id": new_id(), "order_id": order["id"], "order_number": order["number"], "customer_id": order["customer_id"],
           "amount": r2(amount), "method": method, "reference": reference, "type": "payment", "at": now(), "by": by}
    if gateway_payment_id:
        doc["gateway_payment_id"] = gateway_payment_id
    try:
        await db.payments.insert_one(doc)
    except Exception:
        return False  # duplicate gateway payment: already applied
    o = await db.orders.find_one_and_update({"id": order["id"]}, {"$inc": {"amount_paid": r2(amount)}}, projection={"_id": 0}, return_document=True)
    paid = r2(o["amount_paid"])
    pstatus = "paid" if paid >= o["grand_total"] - 0.01 else "partial"
    sets = {"payment_status": pstatus}
    push = {}
    if o["status"] == "pending_payment":
        sets["status"] = "confirmed"
        push = {"$push": {"history": {"status": "confirmed", "at": now(), "by": by, "note": f"Payment {reference}"}}}
    await db.orders.update_one({"id": o["id"]}, {"$set": sets, **push})
    await db.invoices.update_many({"order_id": o["id"]}, {"$set": {"amount_paid": paid}})
    await notify(o.get("user_id"), f"Payment received for {o['number']}", f"₹{amount:,.2f} via {method}", f"/account/orders/{o['id']}")
    return True


class VerifyIn(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/payments/razorpay/verify")
async def verify_payment(body: VerifyIn, member=Depends(current_member)):
    o = await own_order(body.order_id, member)
    secret = os.environ.get("RAZORPAY_KEY_SECRET", "")
    expected = hmac.new(secret.encode(), f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    if not secret or o.get("razorpay_order_id") != body.razorpay_order_id or not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Payment could not be verified")
    pay = await run_in_threadpool(rzp_client().payment.fetch, body.razorpay_payment_id)
    if pay.get("status") not in ("captured", "authorized") or pay.get("order_id") != body.razorpay_order_id:
        raise HTTPException(400, "Payment not completed")
    await apply_payment(o, pay["amount"] / 100, "razorpay", body.razorpay_payment_id, body.razorpay_payment_id, member["email"])
    return {"ok": True}


@router.post("/payments/razorpay/webhook")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
    sig = request.headers.get("x-razorpay-signature", "")
    if not secret or not hmac.compare_digest(hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(), sig):
        raise HTTPException(400, "Invalid signature")
    evt = json.loads(raw)
    eid = request.headers.get("x-razorpay-event-id") or hashlib.sha256(raw).hexdigest()
    try:
        await db.webhook_events.insert_one({"event_id": eid, "event": evt.get("event"), "at": now()})
    except Exception:
        return {"status": "duplicate"}
    ent = (evt.get("payload", {}).get("payment") or {}).get("entity") or {}
    if evt.get("event") in ("payment.captured", "order.paid") and ent.get("order_id"):
        o = await db.orders.find_one({"razorpay_order_id": ent["order_id"]}, {"_id": 0})
        if o:
            await apply_payment(o, ent["amount"] / 100, "razorpay", ent["id"], ent["id"], "webhook")
    elif evt.get("event") == "payment.failed" and ent.get("order_id"):
        await db.orders.update_one({"razorpay_order_id": ent["order_id"]}, {"$set": {"last_payment_error": (ent.get("error_description") or "Payment failed")}})
    return {"status": "ok"}


# ---------------- Enquiries ----------------
class EnquiryIn(BaseModel):
    type: str = "contact"
    name: str
    email: EmailStr
    phone: str = ""
    company: str = ""
    message: str = ""
    items: list[dict] = []


@router.post("/enquiries")
async def create_enquiry(body: EnquiryIn, request: Request, member=Depends(optional_member)):
    rate_limit(request, "enquiry", 10)
    if body.type not in ("contact", "quote", "bulk", "dealer", "newsletter", "product"):
        raise HTTPException(400, "Invalid enquiry type")
    doc = {**body.model_dump(), "id": new_id(), "status": "new", "user_id": (member or {}).get("user_id"), "created_at": now()}
    doc["items"] = [{"sku": str(i.get("sku", ""))[:40], "qty": int(float(i.get("qty") or 0)), "name": str(i.get("name", ""))[:120]} for i in body.items[:100]]
    await db.enquiries.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


# ---------------- Customer documents ----------------
@router.get("/my/quotations")
async def my_quotes(member=Depends(current_member)):
    c = await customer_for(member)
    return await db.quotations.find({"customer_id": c["id"], "status": {"$ne": "draft"}}, {"_id": 0, "lines.cost": 0, "internal_notes": 0}).sort("created_at", -1).to_list(200)


class RespondIn(BaseModel):
    action: str


@router.post("/my/quotations/{qid}/respond")
async def respond_quote(qid: str, body: RespondIn, member=Depends(current_member)):
    c = await customer_for(member)
    q = await db.quotations.find_one({"id": qid, "customer_id": c["id"]}, {"_id": 0})
    if not q:
        raise HTTPException(404, "Quotation not found")
    if q["status"] != "sent" or q["valid_until"] < now()[:10]:
        raise HTTPException(409, "This quotation can no longer be accepted or rejected")
    status = {"accept": "accepted", "reject": "rejected"}.get(body.action)
    if not status:
        raise HTTPException(400, "Invalid action")
    await db.quotations.update_one({"id": qid}, {"$set": {"status": status}, "$push": {"history": {"status": status, "at": now(), "by": member["email"]}}})
    return {"ok": True, "status": status}


@router.get("/my/pricelist.pdf")
async def my_pricelist(member=Depends(current_member)):
    from pdfs import catalogue_pdf
    from pricing import negotiated_map, public_price
    c = await customer_for(member)
    if channel(c) == "retail":
        raise HTTPException(403, "Price lists are available to approved business accounts")
    neg = await negotiated_map(c)
    docs = await db.products.find({"status": "active", "is_published": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    data = await run_in_threadpool(catalogue_pdf, await get_setting("company"), f"Price list — {c.get('business_name') or c['name']}", docs,
                                   "Your price (excl. GST)", lambda p, v: public_price(p, v, c, neg)["price"], True)
    return _pdf(data, "price-list")


@router.get("/my/invoices")
async def my_invoices(member=Depends(current_member)):
    c = await customer_for(member)
    return await db.invoices.find({"customer_id": c["id"]}, {"_id": 0, "lines": 0}).sort("created_at", -1).to_list(200)


def _pdf(data, name):
    return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{name}.pdf"'})


@router.get("/invoices/{iid}/pdf")
async def invoice_pdf(iid: str, member=Depends(current_member)):
    inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
    c = await customer_for(member)
    if not inv or (inv["customer_id"] != (c or {}).get("id") and not has_perm(member, "invoices.view")):
        raise HTTPException(404, "Invoice not found")
    title = "TAX INVOICE" + (" (CANCELLED)" if inv["status"] == "cancelled" else "")
    meta = [("Invoice No", inv["number"]), ("Date", inv["created_at"][:10]), ("Order", inv["order_number"]),
            ("Place of supply", inv["party"].get("address", {}).get("state", "")), ("Payment", inv.get("payment_method", ""))]
    data = await run_in_threadpool(business_pdf, title, inv["number"], inv["company"], inv["party"], meta, inv, inv.get("notes", ""))
    return _pdf(data, inv["number"].replace("/", "-"))


@router.get("/quotations/{qid}/pdf")
async def quote_pdf(qid: str, proforma: bool = False, member=Depends(current_member)):
    q = await db.quotations.find_one({"id": qid}, {"_id": 0})
    c = await customer_for(member)
    if not q or ((q["customer_id"] != (c or {}).get("id") or q["status"] == "draft") and not has_perm(member, "quotations.edit")):
        raise HTTPException(404, "Quotation not found")
    company = await get_setting("company")
    meta = [("Quotation No", q["number"]), ("Date", q["created_at"][:10]), ("Valid until", q["valid_until"]),
            ("Delivery", q.get("delivery_terms")), ("Payment terms", q.get("payment_terms"))]
    data = await run_in_threadpool(business_pdf, "PROFORMA INVOICE" if proforma else "QUOTATION", q["number"], company, q["party"], meta, q, q.get("notes", ""))
    return _pdf(data, q["number"].replace("/", "-"))
