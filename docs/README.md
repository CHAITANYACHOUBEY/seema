# Seema Enterprise — Digital Business Platform (Phase 1)

## Stack (platform equivalent of the requested stack)
| Requested | Built with | Why |
|---|---|---|
| Next.js + TS | React 19 (CRA/craco) + Tailwind + shadcn/ui + framer-motion | Emergent platform template |
| NestJS + PostgreSQL + Prisma | FastAPI (modular routers) + MongoDB (motor) | Platform-managed DB; transactions replaced by atomic conditional updates |
| Auth | Emergent-managed Clerk (email/password + Google) | Hashing/sessions handled by provider; roles stored in app DB |
| Object storage | Emergent object storage (`/api/files/...`) | Product images, documents, logos |
| Payments | Razorpay (server-side signature + webhook verification) | Needs owner keys |
| Android (Expo) | **Not built yet** — Phase 8. Website is fully responsive and uses the same `/api` | |

## Backend modules (`/app/backend`)
- `core.py` — DB, roles/permissions (code), member resolution, audit log, counters, stock ledger helpers.
- `pricing.py` — shared pricing + GST engine (see docs/PRICING.md).
- `r_catalog.py` — public catalogue, site config, sitemap, catalogue PDF; admin categories/products/uploads/CSV import-export.
- `r_shop.py` — account, wishlist, cart (guest + user, merge), checkout, orders, returns, Razorpay verify/webhook, enquiries, customer documents.
- `r_admin.py` — dashboard, customers & approvals, negotiated prices, orders/payments/refunds, invoices & credit notes, quotations, inventory, coupons, returns, enquiries, settings/content, staff roles, audit, reports, catalogue builder.
- `pdfs.py` — A4 quotation / proforma / tax invoice / packing slip / catalogue PDFs (reportlab).
- `seed.py` — idempotent indexes + clearly labelled `[Sample]` data.

## Key rules
- All prices, discounts, GST and totals are recomputed server-side at cart, checkout and quotation time.
- Stock is decremented with a conditional atomic update (`stock >= qty`) per line; failures roll back previously reserved lines → no overselling.
- Every stock change writes `stock_movements` (opening, sale, cancel, return, receipt, reduction, adjustment, count) with user.
- Orders are only marked paid after Razorpay signature verification + payment fetch, or a verified webhook; payments are idempotent (unique `gateway_payment_id`, unique webhook `event_id`).
- Issued invoices are immutable; cancellation creates a credit note.
- Permissions enforced on the server (`require_perm`), never only in UI.

## Environment variables (backend/.env)
`MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (platform-managed), `ADMIN_EMAIL`, `EMERGENT_LLM_KEY` (object storage),
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (**owner must supply**; webhook URL: `<domain>/api/payments/razorpay/webhook`).

## Owner-supplied / pending integrations
- Razorpay account + keys (business verification by Razorpay).
- Email provider, WhatsApp Business API, push notifications — not connected yet (in-app notifications only).
- Courier/shipping API — manual courier + tracking number entry for now.

## Testing helpers
`python3 scripts/clerk_token.py <clerk_user_id>` → session JWT for API tests. Test users in `/app/memory/test_credentials.md`.
