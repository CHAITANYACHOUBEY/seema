import os
import re
import uuid
from datetime import datetime, timezone

import requests
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool

from clerk_auth import require_user

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Role list is code. Highest first; `admin` = Super Admin.
ROLES = ["admin", "sales_manager", "product_manager", "inventory_manager", "accountant",
         "sales_executive", "support", "customer"]
DEFAULT_ROLE = "customer"
RETIRED_ROLES = {}
RANK = {r: len(ROLES) - i for i, r in enumerate(ROLES)}
PERMS = {
    "admin": ["*"],
    "sales_manager": ["dashboard", "products.view", "prices.view_wholesale", "customers.view", "customers.edit",
                      "customers.approve", "orders.view", "orders.edit", "quotations.edit", "quotations.approve",
                      "discounts.approve", "invoices.view", "reports.view", "enquiries.view", "coupons.edit",
                      "returns.edit", "inventory.view"],
    "product_manager": ["dashboard", "products.view", "products.edit", "prices.edit", "prices.view_wholesale",
                        "content.edit", "inventory.view", "coupons.edit"],
    "inventory_manager": ["dashboard", "products.view", "inventory.view", "inventory.edit", "orders.view", "orders.edit",
                          "returns.edit"],
    "accountant": ["dashboard", "orders.view", "invoices.view", "invoices.edit", "payments.record", "reports.view",
                   "customers.view", "prices.view_wholesale", "inventory.view"],
    "sales_executive": ["dashboard", "products.view", "prices.view_wholesale", "customers.view", "customers.edit",
                        "quotations.edit", "orders.view", "enquiries.view"],
    "support": ["dashboard", "orders.view", "customers.view", "enquiries.view", "returns.edit"],
    "customer": [],
}
ENV = "live" if os.environ.get("CLERK_PUBLISHABLE_KEY", "").startswith("pk_live_") else "preview"
IN_ENV = {"env": {"$in": [ENV, None]}}


def now():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or new_id()[:8]


def effective_role(role) -> str:
    role = RETIRED_ROLES.get(role, role)
    return role if role in ROLES else DEFAULT_ROLE


def has_perm(member, perm: str) -> bool:
    if not member:
        return False
    ps = PERMS.get(member["role"], [])
    return "*" in ps or perm in ps


def is_staff(member) -> bool:
    return bool(member) and member["role"] != "customer"


def _clerk_profile(user_id: str) -> dict:
    r = requests.get(f"https://api.clerk.com/v1/users/{user_id}", timeout=10,
                     headers={"Authorization": f"Bearer {os.environ['CLERK_SECRET_KEY']}", "User-Agent": "emergent-app"})
    r.raise_for_status()
    u = r.json()
    admins = {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}
    verified = [e["email_address"].lower() for e in u.get("email_addresses", [])
                if (e.get("verification") or {}).get("status") == "verified"]
    email = verified[0] if verified else (u.get("email_addresses") or [{}])[0].get("email_address", "")
    name = " ".join(x for x in [u.get("first_name"), u.get("last_name")] if x) or email.split("@")[0]
    return {"email": email, "name": name, "is_admin": any(e in admins for e in verified)}


async def _member_from_user(user: dict) -> dict:
    uid = user["user_id"]
    member = await db.users.find_one({"user_id": uid}, {"_id": 0})
    if member is None or not member.get("role"):
        prof = await run_in_threadpool(_clerk_profile, uid)
        role = "admin" if prof["is_admin"] else DEFAULT_ROLE
        await db.users.update_one({"user_id": uid, "role": {"$in": [None, ""]}}, {"$set": {"role": role}})
        member = await db.users.find_one_and_update(
            {"user_id": uid},
            {"$setOnInsert": {"user_id": uid, "role": role, "email": prof["email"], "name": prof["name"], "created_at": now()}},
            upsert=True, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not await db.customers.find_one({"user_id": uid}, {"_id": 1}):
        try:
            await db.customers.insert_one({
                "id": new_id(), "user_id": uid, "name": member.get("name", ""), "email": member.get("email", ""), "phone": "",
                "customer_type": "retail", "price_group": "retail", "status": "active", "business_name": "",
                "gstin": "", "addresses": [], "credit_limit": 0, "payment_terms": "", "notes": "", "sales_rep": "",
                "created_at": now(), "source": "signup"})
        except Exception:
            pass
    if member.get("env") != ENV:
        await db.users.update_one({"user_id": uid}, {"$set": {"env": ENV}})
    return {**member, "env": ENV, "role": effective_role(member["role"])}


async def current_member(user: dict = Depends(require_user)) -> dict:
    return await _member_from_user(user)


async def optional_member(request: Request):
    if not request.headers.get("authorization"):
        return None
    try:
        return await _member_from_user(require_user(request))
    except HTTPException:
        return None


def require_perm(perm: str):
    async def check(member: dict = Depends(current_member)) -> dict:
        if not has_perm(member, perm):
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return member
    return check


async def customer_for(member):
    if not member:
        return None
    return await db.customers.find_one({"user_id": member["user_id"]}, {"_id": 0})


async def audit(member, action: str, entity: str, entity_id: str = "", details=None):
    await db.audit_logs.insert_one({
        "id": new_id(), "at": now(), "user_id": (member or {}).get("user_id", "system"),
        "user_email": (member or {}).get("email", "system"), "action": action, "entity": entity,
        "entity_id": entity_id, "details": details or {}})


async def next_number(key: str, prefix: str, width: int = 5) -> str:
    doc = await db.counters.find_one_and_update({"key": key}, {"$inc": {"seq": 1}}, upsert=True,
                                                return_document=ReturnDocument.AFTER)
    return f"{prefix}{str(doc['seq']).zfill(width)}"


def fin_year() -> str:
    d = datetime.now(timezone.utc)
    y = d.year if d.month >= 4 else d.year - 1
    return f"{y}-{str(y + 1)[2:]}"


async def get_setting(key: str) -> dict:
    doc = await db.settings.find_one({"key": key}, {"_id": 0})
    return (doc or {}).get("value", {})


async def record_movement(member, product_id, sku, qty, mtype, ref="", note=""):
    """Append to stock ledger. Caller has already applied the stock change atomically."""
    p = await db.products.find_one({"id": product_id, "variants.sku": sku}, {"variants.$": 1, "_id": 0})
    bal = p["variants"][0].get("stock", 0) if p else None
    await db.stock_movements.insert_one({
        "id": new_id(), "at": now(), "product_id": product_id, "sku": sku, "qty": qty, "type": mtype,
        "balance_after": bal, "ref": ref, "note": note, "by": (member or {}).get("email", "system")})


async def take_stock(product_id: str, sku: str, qty: int) -> bool:
    res = await db.products.update_one(
        {"id": product_id, "variants": {"$elemMatch": {"sku": sku, "stock": {"$gte": qty}}}},
        {"$inc": {"variants.$.stock": -qty}})
    return res.modified_count == 1


async def give_stock(product_id: str, sku: str, qty: int):
    await db.products.update_one({"id": product_id, "variants.sku": sku}, {"$inc": {"variants.$.stock": qty}})
