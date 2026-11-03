import axios from "axios";

export const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;
let tokenGetter = null;
export const setTokenGetter = (fn) => { tokenGetter = fn; };

export const cartId = () => {
  let id = localStorage.getItem("se_cart");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("se_cart", id); }
  return id;
};

export const api = axios.create({ baseURL: API });
api.interceptors.request.use(async (cfg) => {
  const t = tokenGetter ? await tokenGetter() : null;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  else cfg.headers["X-Cart-Id"] = cartId();
  return cfg;
});

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.errors) return d.errors.map((x) => x.error).join(" · ");
  if (Array.isArray(d)) return d.map((x) => `${x.loc?.slice(-1)[0] || ""} ${x.msg}`).join(", ");
  return "Something went wrong. Please try again.";
};

export const openPdf = async (path, body) => {
  const w = window.open("", "_blank");
  try {
    const r = body ? await api.post(path, body, { responseType: "blob" }) : await api.get(path, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
    if (w) w.location = url; else window.location = url;
  } catch (e) {
    if (w) w.close();
    throw e;
  }
};

export const downloadCsv = async (path, name) => {
  const r = await api.get(path, { responseType: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.data);
  a.download = name;
  a.click();
};

export const img = (u) => (u && u.startsWith("/api/") ? `${BACKEND}${u}` : u || "/samples/s1.jpeg");

export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const RULE_LABEL = {
  negotiated: "Your negotiated price", "contract:wholesale": "Wholesale price", "contract:dealer": "Dealer price",
  "contract:distributor": "Distributor price", promotion: "Offer price", standard: "",
};
export const ruleLabel = (r) => RULE_LABEL[r] ?? (r?.startsWith("quantity") ? `Bulk price (${r.split(":")[1]})` : "");

export const STATUS_TONE = {
  confirmed: "bg-sky-50 text-sky-700", processing: "bg-amber-50 text-amber-700", packed: "bg-amber-50 text-amber-700",
  shipped: "bg-indigo-50 text-indigo-700", delivered: "bg-emerald-50 text-emerald-700", cancelled: "bg-red-50 text-red-700",
  pending_payment: "bg-orange-50 text-orange-700", draft: "bg-stone-100 text-stone-700", sent: "bg-sky-50 text-sky-700",
  accepted: "bg-emerald-50 text-emerald-700", rejected: "bg-red-50 text-red-700", expired: "bg-stone-100 text-stone-500",
  issued: "bg-emerald-50 text-emerald-700", pending: "bg-orange-50 text-orange-700", approved: "bg-emerald-50 text-emerald-700",
  active: "bg-emerald-50 text-emerald-700", archived: "bg-stone-100 text-stone-500", paid: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700", refunded: "bg-stone-100 text-stone-600", requested: "bg-orange-50 text-orange-700",
  received: "bg-sky-50 text-sky-700", new: "bg-orange-50 text-orange-700", inactive: "bg-stone-100 text-stone-500",
};
