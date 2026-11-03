# Seema Enterprise — PRD

## Original problem statement
"MASTER SOFTWARE DEVELOPMENT PROMPT — SEEMA ENTERPRISE — COMPLETE DIGITAL BUSINESS ECOSYSTEM": premium animated e-commerce website, Android app, secure admin dashboard, customer portal, wholesale/dealer portal, retail shopping, quotation/invoice/billing, product/pricing/inventory/customer management, unified backend, reporting/analytics/notifications. Gujarat, India; INR; bathroom accessories, SS accessories, sanitary, fasteners + future categories. (Full 30-section brief provided by owner in first message.)

User choices: Phase 1 = website + admin panel + wholesale portal (all selected); payments = Razorpay; sign-in = email/password + Google; logo/photos uploaded later; labelled sample products; "I AM MANUFACTURER AND I AM ALSO SELLING PRODUCTS". Owner/admin email: chaitanyaironman38@gmail.com.

## Architecture
React (craco) + Tailwind + shadcn + framer-motion | FastAPI modular routers (core, pricing, r_catalog, r_shop, r_admin, pdfs, seed) | MongoDB | Emergent Clerk auth (roles in app DB) | Emergent object storage | Razorpay (keys pending) | reportlab PDFs. Docs: /app/docs/README.md, /app/docs/PRICING.md.

## Personas
Owner/Super Admin; staff (sales manager/exec, product mgr, inventory mgr, accountant, support); retail customer; wholesale/dealer/distributor/contractor/builder/designer buyers.

## Implemented (2026-10-27)
- Storefront: animated hero w/ real counters, mega menu, collections, new/featured, banners, about/quality, bulk enquiry, FAQ, newsletter, WhatsApp float (when number set), catalogue PDF, shop with filters/facets/sort, product page (gallery zoom, variants, tiers, MOQ, stock, add/buy/quote/WhatsApp, specs, docs, JSON-LD), cart drawer, checkout (COD/bank transfer; Razorpay when keys added), order page (pay/cancel/return/reorder/invoice), account (orders, quotations accept/reject, invoices, wishlist, profile, business application, notifications), wholesale (apply, quick order by SKU + CSV), RFQ, contact, policies, sitemap/robots.
- Pricing engine with documented precedence; GST CGST/SGST vs IGST; coupons; server-side totals; atomic stock reservation; idempotent checkout; Razorpay verify + webhook (idempotent).
- Admin: dashboard KPIs/charts, products (variants, images upload/reorder, docs, attributes by category, specs, tiers, price history, duplicate/archive/publish, CSV export + bulk price/stock import), categories (nested, attribute definitions), customers (approvals, price groups, negotiated prices, credit/terms, notes, change log, export), orders (status flow, shipment, payments, refunds, invoice, packing slip), quotations (builder, statuses, PDF/proforma, duplicate, convert), invoices + credit notes, inventory ledger/adjust/valuation, coupons, enquiries & returns, reports + CSV + catalogue/price-list builder, content CMS, company/commerce settings, staff roles/permissions, audit log.
- Tested: iteration_1 (backend 26/29 → bugs fixed: cost leak, regex 500, cancel-with-invoice credit note, KPI consistency, slug keep, idempotency index, coupon race, stale search). Test data wiped & samples reseeded.

## Backlog
- P0: Razorpay keys (RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET) + sandbox payment test; owner company details/GSTIN/logo/real products.
- P1: Android app (Expo) on same API; email/WhatsApp notifications; courier API; scheduled promotions/publish; product comparison; warehouses; credit-limit enforcement; quotation follow-up reminders (cron).
- P2: multi-language, push notifications, data export/deletion workflow, backups/monitoring docs.
