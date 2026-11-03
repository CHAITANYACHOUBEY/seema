# Pricing & tax engine (`backend/pricing.py`)

Used by product pages, cart, checkout, quick order, quotations, price lists and catalogue PDFs.

## Unit price precedence — first match wins (no stacking)
1. **Negotiated** customer price (`customer_prices` for that customer + SKU).
2. **Contract / group price** — customer `status=approved` and `price_group` in wholesale/dealer/distributor and the variant has that price.
3. **Quantity tier** — product `tiers` (min_qty → % off *retail*), highest qualifying tier.
4. **Promotion** — variant `sale_price` inside optional `sale_start`/`sale_end` window.
5. **Standard retail** price.

Coupons are order-level and apply *after* unit pricing, allocated proportionally across lines before GST.
Quotation line discounts (%) apply on top of the engine price; above `max_staff_discount` requires `discounts.approve`.

## GST
- Each product has `hsn` and `gst_rate`.
- Ship-to state == company state (Settings, default Gujarat) → CGST + SGST (half each); otherwise IGST.
- `prices_include_tax` setting: when on, entered prices are treated as GST-inclusive and taxable value is back-calculated.
- Shipping charge is added after tax (no GST applied on shipping in Phase 1 — confirm with your CA).
- Arithmetic uses Python `Decimal`, rounded half-up to 2 decimals per line.
