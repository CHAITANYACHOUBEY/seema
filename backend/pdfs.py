from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from storage import get_object

SS = getSampleStyleSheet()
H = ParagraphStyle("h", parent=SS["Title"], fontName="Times-Bold", fontSize=20, textColor=colors.HexColor("#1E2024"), alignment=0)
S = ParagraphStyle("s", parent=SS["Normal"], fontSize=8.5, leading=11)
B = ParagraphStyle("b", parent=S, fontName="Helvetica-Bold")
GOLD = colors.HexColor("#C5A059")
SAMPLES = Path(__file__).parent.parent / "frontend" / "public"


def rs(x):
    return f"Rs. {float(x or 0):,.2f}"


def load_image(url: str):
    try:
        if url.startswith("/samples/"):
            return BytesIO((SAMPLES / url.lstrip("/")).read_bytes())
        if "/api/files/" in url:
            return BytesIO(get_object(url.split("/api/files/", 1)[1])[0])
    except Exception:
        return None
    return None


def _company_block(company):
    lines = [f"<b>{company.get('name') or 'Seema Enterprise'}</b>", company.get("address") or "",
             " | ".join(x for x in [company.get("phone"), company.get("email")] if x),
             f"GSTIN: {company['gstin']}" if company.get("gstin") else ""]
    return Paragraph("<br/>".join(l for l in lines if l), S)


def _grid(data, widths, header=True):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [("FONTSIZE", (0, 0), (-1, -1), 8), ("VALIGN", (0, 0), (-1, -1), "TOP"),
          ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#DDDDDD"))]
    if header:
        st += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E2024")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
               ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    t.setStyle(TableStyle(st))
    return t


def business_pdf(title, number, company, party, meta, doc, notes="", show_prices=True):
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    el = [Table([[_company_block(company), Paragraph(f"<font size=16><b>{title}</b></font><br/>{number}", S)]],
                colWidths=[110 * mm, 72 * mm]), Spacer(1, 4), Table([[""]], colWidths=[182 * mm], style=[("LINEABOVE", (0, 0), (-1, -1), 1.2, GOLD)])]
    addr = party.get("address") or {}
    addr_txt = ", ".join(str(addr.get(k)) for k in ("line1", "line2", "city", "state", "pincode") if addr.get(k)) if isinstance(addr, dict) else str(addr)
    pinfo = "<br/>".join(x for x in [f"<b>{party.get('name', '')}</b>", party.get("business_name", ""), addr_txt,
                                    party.get("phone", ""), party.get("email", ""),
                                    f"GSTIN: {party['gstin']}" if party.get("gstin") else ""] if x)
    minfo = "<br/>".join(f"<b>{k}:</b> {v}" for k, v in meta if v)
    el += [Table([[Paragraph("<b>Bill To</b><br/>" + pinfo, S), Paragraph(minfo, S)]], colWidths=[110 * mm, 72 * mm]), Spacer(1, 8)]
    if show_prices:
        rows = [["#", "Item / SKU", "HSN", "Qty", "Rate", "Disc%", "Taxable", "GST%", "Tax", "Total"]]
        for i, l in enumerate(doc["lines"], 1):
            rows.append([i, Paragraph(f"{l['name']} {('- ' + l['variant']) if l.get('variant') else ''}<br/><font color='#64748B'>{l['sku']}</font>", S),
                         l.get("hsn", ""), l["qty"], f"{l['unit_price']:,.2f}", f"{l.get('discount_pct', 0):g}",
                         f"{l['taxable']:,.2f}", f"{l['gst_rate']:g}", f"{l['tax']:,.2f}", f"{l['total']:,.2f}"])
        el.append(_grid(rows, [7 * mm, 55 * mm, 15 * mm, 11 * mm, 17 * mm, 11 * mm, 19 * mm, 11 * mm, 16 * mm, 20 * mm]))
        tot = [["Subtotal", rs(doc["subtotal"])]]
        if doc.get("discount"):
            tot.append(["Discount", "- " + rs(doc["discount"])])
        tot.append(["Taxable value", rs(doc["taxable"])])
        if doc.get("igst"):
            tot.append(["IGST", rs(doc["igst"])])
        else:
            tot += [["CGST", rs(doc.get("cgst"))], ["SGST", rs(doc.get("sgst"))]]
        tot.append(["Shipping", rs(doc.get("shipping"))])
        tot.append(["Grand Total", rs(doc["grand_total"])])
        if doc.get("amount_paid") is not None:
            tot += [["Paid", rs(doc["amount_paid"])], ["Balance due", rs(doc["grand_total"] - doc["amount_paid"])]]
        t = Table(tot, colWidths=[40 * mm, 35 * mm], hAlign="RIGHT")
        t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                               ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold") if doc.get("amount_paid") is None else
                               ("FONTNAME", (0, -3), (-1, -3), "Helvetica-Bold"), ("LINEABOVE", (0, 0), (-1, 0), 0.5, GOLD)]))
        el += [Spacer(1, 6), t]
    else:
        rows = [["#", "Item", "SKU", "Qty", "Packed"]] + [[i, l["name"] + (" - " + l["variant"] if l.get("variant") else ""), l["sku"], l["qty"], "[  ]"]
                                                         for i, l in enumerate(doc["lines"], 1)]
        el.append(_grid(rows, [8 * mm, 90 * mm, 40 * mm, 20 * mm, 24 * mm]))
    if notes:
        el += [Spacer(1, 10), Paragraph(notes.replace("\n", "<br/>"), S)]
    el += [Spacer(1, 18), Paragraph("This is a computer-generated document.", ParagraphStyle("f", parent=S, textColor=colors.grey))]
    pdf.build(el)
    return buf.getvalue()


def catalogue_pdf(company, title, products, price_label=None, price_fn=None, specs=True):
    buf = BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    el = [Paragraph(company.get("name") or "Seema Enterprise", H), Paragraph(title, B), Spacer(1, 4),
          Table([[""]], colWidths=[182 * mm], style=[("LINEABOVE", (0, 0), (-1, -1), 1.2, GOLD)]), Spacer(1, 6)]
    for p in products:
        img = load_image((p.get("images") or [""])[0])
        pic = Image(img, width=34 * mm, height=34 * mm) if img else Paragraph("", S)
        spec = "<br/>".join(f"{s['label']}: {s['value']}" for s in (p.get("specs") or [])[:6]) if specs else ""
        attrs = ", ".join(f"{k}: {v}" for k, v in (p.get("attributes") or {}).items())
        vrows = [["SKU", "Variant"] + ([price_label] if price_label else [])]
        for v in p.get("variants", []):
            vrows.append([v["sku"], v.get("name", "")] + ([rs(price_fn(p, v))] if price_label else []))
        info = [Paragraph(f"<b>{p['name']}</b>", B), Paragraph(attrs, S), Paragraph(spec, S),
                _grid(vrows, [35 * mm, 60 * mm] + ([30 * mm] if price_label else []))]
        el += [Table([[pic, info]], colWidths=[40 * mm, 142 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP")]), Spacer(1, 8)]
    if not products:
        el.append(Paragraph("No products selected.", S))
    pdf.build(el)
    return buf.getvalue()
