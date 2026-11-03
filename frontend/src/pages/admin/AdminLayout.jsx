import { NavLink, Navigate, Outlet, Link } from "react-router-dom";
import { Show } from "@clerk/react";
import { BarChart3, Boxes, ClipboardList, FileText, FolderTree, Gauge, LifeBuoy, Package, Receipt, Settings, ShieldCheck, Tag, Users, Warehouse, PenSquare, ArrowLeft } from "lucide-react";
import { useApp } from "@/lib/store";

export const ADMIN_NAV = [
  ["/admin", "Dashboard", Gauge, "dashboard"], ["/admin/products", "Products", Package, "products.view"], ["/admin/categories", "Categories", FolderTree, "products.view"],
  ["/admin/customers", "Customers", Users, "customers.view"], ["/admin/orders", "Orders", ClipboardList, "orders.view"], ["/admin/quotations", "Quotations", FileText, "quotations.edit"],
  ["/admin/invoices", "Invoices & payments", Receipt, "invoices.view"], ["/admin/inventory", "Inventory", Warehouse, "inventory.view"], ["/admin/coupons", "Coupons", Tag, "coupons.edit"],
  ["/admin/service", "Enquiries & returns", LifeBuoy, "enquiries.view"], ["/admin/reports", "Reports & catalogue", BarChart3, "reports.view"], ["/admin/content", "Website content", PenSquare, "content.edit"],
  ["/admin/settings", "Company settings", Settings, "settings.edit"], ["/admin/staff", "Staff & audit", ShieldCheck, "staff.manage"],
];

function Shell() {
  const { me, can } = useApp();
  if (!me) return <div className="p-10 text-stone-500">Loading…</div>;
  if (me.role === "customer") return <div className="mx-auto max-w-lg py-24 text-center" data-testid="admin-denied"><p className="font-display text-3xl">Staff access only</p><p className="mt-2 text-sm text-stone-500">Your account does not have admin permissions.</p><Link to="/" className="mt-4 inline-block underline">Back to store</Link></div>;
  return (
    <div className="min-h-screen bg-[#F4F3EF] lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="bg-[#1E2024] text-stone-300 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-5"><Link to="/admin" className="font-display text-xl text-white">Seema <span className="text-[#C5A059]">Admin</span></Link>
          <Link to="/" className="text-[10px] uppercase tracking-widest text-stone-500 hover:text-white"><ArrowLeft className="inline h-3 w-3" /> Store</Link></div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {ADMIN_NAV.filter(([, , , p]) => can(p)).map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/admin"} data-testid={`admin-nav-${label.split(" ")[0].toLowerCase()}`}
              className={({ isActive }) => `flex shrink-0 items-center gap-3 px-3 py-2 text-sm transition-colors ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"}`}>
              <Icon className="h-4 w-4 text-[#C5A059]" />{label}</NavLink>))}
        </nav>
        <p className="hidden px-5 py-4 text-[11px] text-stone-500 lg:block">{me.email}<br /><span className="uppercase tracking-widest text-[#C5A059]">{me.role.replace(/_/g, " ")}</span></p>
      </aside>
      <main className="min-w-0 p-4 sm:p-8"><Outlet /></main>
    </div>
  );
}

export default function AdminLayout() {
  return (<><Show when="signed-in"><Shell /></Show><Show when="signed-out"><Navigate to="/sign-in" replace /></Show></>);
}

export const Panel = ({ title, children, className = "", action }) => (
  <section className={`border border-stone-200 bg-white p-5 ${className}`}>
    {title && <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{title}</p>{action}</div>}
    {children}
  </section>
);

export { Boxes };
