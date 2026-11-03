"""Ad-hoc probes: idempotency race, dashboard/report consistency."""
import json
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, "/app/backend/tests")
from conftest import BASE_URL as B, _client, ADMIN_ID, BUYER_ID  # noqa

admin, buyer = _client(ADMIN_ID), _client(BUYER_ID)
ADDR = {"name": "TEST_Buyer", "phone": "9876543210", "line1": "TEST_ 1", "city": "Ahmedabad", "state": "Gujarat", "pincode": "380001"}

d = admin.get(f"{B}/api/admin/dashboard").json()
print("DASH keys", list(d.keys()))
print("DASH", json.dumps({k: v for k, v in d.items() if not isinstance(v, list)})[:800])
rep = admin.get(f"{B}/api/admin/reports/sales", params={"group": "month"}).json()
print("REPORT", json.dumps(rep)[:800])
orders = admin.get(f"{B}/api/admin/orders", params={"limit": 500}).json()["items"]
valid = [o for o in orders if o["status"] not in ("cancelled", "pending_payment")]
print("orders total", len(orders), "non-cancelled", len(valid), "sum grand", round(sum(o["grand_total"] for o in valid), 2),
      "sum taxable", round(sum(o["taxable"] for o in valid), 2))

# idempotency race: same key in parallel
buyer.post(f"{B}/api/cart/items", json={"sku": "SE-RH2-CH", "qty": 1, "mode": "set"})
key = str(uuid.uuid4())
with ThreadPoolExecutor(2) as ex:
    res = list(ex.map(lambda _: buyer.post(f"{B}/api/checkout", json={"address": ADDR, "payment_method": "cod", "notes": "TEST_idem_race"},
                                           headers={"Idempotency-Key": key}), range(2)))
ids = [r.json().get("order", {}).get("id") if r.status_code == 200 else r.status_code for r in res]
print("IDEM RACE", [r.status_code for r in res], ids, "DUPLICATE" if len({i for i in ids if isinstance(i, str)}) > 1 else "same")
for r in res:
    if r.status_code == 200:
        admin.post(f"{B}/api/admin/orders/{r.json()['order']['id']}/status", json={"status": "cancelled", "note": "TEST cleanup"})
print("SD1 stock", admin.get(f"{B}/api/products/by-sku/SE-SD1-CH").json()["variant"]["stock"])
