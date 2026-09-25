"""
Render the sample paper PDFs for seeding (2 to 4 pages each: title, authors, abstract, sections,
a figure, a table, references). Run through the node wrapper, which also updates the manifest:

    node scripts/seed-media/gen-pdfs.mjs

or directly:

    uv run --no-project --with reportlab --with pillow python scripts/seed-media/pdfs/gen_pdfs.py \
        --out apps/api/seed/assets/pdfs --meta /tmp/pdfs.json

Fonts are the static brand instances in scripts/brand/fonts/build (run scripts/brand/outline_text.py first).
Every PDF says in its footer that it is sample seed content, not a real paper.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image as RLImage,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from papers import PAPERS

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
FONTS = REPO / "scripts" / "brand" / "fonts" / "build"
PUB = REPO / "apps" / "api" / "seed" / "assets" / "pub-covers"

INK = HexColor("#0e1116")
INK2 = HexColor("#3b4150")
INK3 = HexColor("#6b7280")
LINE = HexColor("#d8d8d2")
BLUE = HexColor("#3a6dc5")
MUTED = HexColor("#f7f7f5")

pdfmetrics.registerFont(TTFont("Display", str(FONTS / "Recursive-Zemi-Display.ttf")))
pdfmetrics.registerFont(TTFont("Mono", str(FONTS / "Recursive-Zemi-Mono.ttf")))
pdfmetrics.registerFont(TTFont("Body", str(FONTS / "AtkinsonHyperlegibleNext-Zemi-Medium.ttf")))
pdfmetrics.registerFont(TTFont("BodyBold", str(FONTS / "AtkinsonHyperlegibleNext-Zemi-Bold.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="BodyBold", italic="Body", boldItalic="BodyBold")

S = {
    "label": ParagraphStyle("label", fontName="Mono", fontSize=7.5, leading=10, textColor=INK3, spaceAfter=6),
    "title": ParagraphStyle("title", fontName="Display", fontSize=21, leading=24, textColor=INK, spaceAfter=10),
    "authors": ParagraphStyle("authors", fontName="BodyBold", fontSize=10, leading=14, textColor=INK2),
    "affil": ParagraphStyle("affil", fontName="Body", fontSize=8.5, leading=12, textColor=INK3, spaceAfter=12),
    "abs_h": ParagraphStyle("abs_h", fontName="Mono", fontSize=8, leading=11, textColor=BLUE, spaceAfter=12),
    "abs": ParagraphStyle("abs", fontName="Body", fontSize=9.5, leading=14, textColor=INK, backColor=MUTED, borderPadding=(8, 10, 8, 10), spaceAfter=6),
    "kw": ParagraphStyle("kw", fontName="Body", fontSize=8.5, leading=12, textColor=INK2, spaceBefore=10, spaceAfter=10),
    "h1": ParagraphStyle("h1", fontName="Display", fontSize=13, leading=16, textColor=INK, spaceBefore=12, spaceAfter=5),
    "p": ParagraphStyle("p", fontName="Body", fontSize=10, leading=15, textColor=INK, spaceAfter=7, alignment=TA_LEFT),
    "cap": ParagraphStyle("cap", fontName="Body", fontSize=8.5, leading=12, textColor=INK2, spaceBefore=4, spaceAfter=10),
    "ref": ParagraphStyle("ref", fontName="Body", fontSize=8.5, leading=12, textColor=INK2, leftIndent=14, firstLineIndent=-14, spaceAfter=3),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=8.5, leading=11, textColor=INK),
    "cellh": ParagraphStyle("cellh", fontName="Mono", fontSize=7.5, leading=10, textColor=INK3),
}


def figure(pub_cover: str, width: float, fit: bool = False) -> RLImage:
    """Figure image: a crop of a generated pub cover, resized so the PDF stays small.

    fit=True keeps the whole 4:5 cover (for grid-like figures a crop would cut through).
    """
    im = Image.open(PUB / f"{pub_cover}.jpg").convert("RGB")
    w, h = im.size
    if not fit:
        # landscape 4:3 crop from the middle of the 4:5 cover so the figure fits under the text
        ch = int(w * 0.75)
        top = (h - ch) // 2
        im = im.crop((0, top, w, top + ch))
    im.thumbnail((900, 900))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78, optimize=True)
    buf.seek(0)
    ratio = im.size[1] / im.size[0]
    return RLImage(buf, width=width, height=width * ratio)


def footer(title: str):
    def draw(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(20 * mm, 14 * mm, A4[0] - 20 * mm, 14 * mm)
        canvas.setFont("Mono", 7)
        canvas.setFillColor(INK3)
        canvas.drawString(20 * mm, 9.5 * mm, "Zemi sample paper. Seed content for development, not a real publication.")
        canvas.drawRightString(A4[0] - 20 * mm, 9.5 * mm, f"{doc.page}")
        canvas.restoreState()

    return draw


def build(paper: dict, out: Path) -> dict:
    doc = SimpleDocTemplate(
        str(out), pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=22 * mm,
        title=paper["title"], author=", ".join(a["name"] for a in paper["authors"]), subject=paper["venue"],
        keywords=", ".join(paper["keywords"]), creator="Zemi seed-media",
    )
    width = A4[0] - 44 * mm
    affils = paper["affiliations"]
    story = [
        Paragraph(f'{paper["type"].upper()}  /  {paper["venue"].upper()}  /  {paper["year"]}', S["label"]),
        Paragraph(paper["title"], S["title"]),
        Paragraph(", ".join(f'{a["name"]}<super>{a["affil"]}</super>{"*" if a.get("corresponding") else ""}' for a in paper["authors"]), S["authors"]),
        Paragraph("<br/>".join(f"<super>{i + 1}</super> {x}" for i, x in enumerate(affils)) + "<br/>* Corresponding author", S["affil"]),
        Paragraph("ABSTRACT", S["abs_h"]),
        Paragraph(paper["abstract"], S["abs"]),
        Paragraph("<b>Keywords:</b> " + ", ".join(paper["keywords"]), S["kw"]),
    ]
    fig_done = table_done = False
    for i, (heading, paras) in enumerate(paper["sections"]):
        story.append(Paragraph(f"{i + 1}. {heading}", S["h1"]))
        for p in paras:
            story.append(Paragraph(p, S["p"]))
        if heading == paper.get("figure_after", "Method") and not fig_done:
            story.append(KeepTogether([figure(paper["figure"], width * (0.46 if paper.get("figure_fit") else 0.62), paper.get("figure_fit", False)), Paragraph(paper["figure_caption"], S["cap"])]))
            fig_done = True
        if heading == "Results" and not table_done:
            head, *rows = paper["table"]
            data = [[Paragraph(c, S["cellh"]) for c in head]] + [[Paragraph(c, S["cell"]) for c in r] for r in rows]
            t = Table(data, colWidths=[width * 0.4] + [width * 0.6 / (len(head) - 1)] * (len(head) - 1))
            t.setStyle(
                TableStyle(
                    [
                        ("LINEABOVE", (0, 0), (-1, 0), 0.8, INK),
                        ("LINEBELOW", (0, 0), (-1, 0), 0.5, LINE),
                        ("LINEBELOW", (0, -1), (-1, -1), 0.8, INK),
                        ("BACKGROUND", (0, -1), (-1, -1), MUTED),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(KeepTogether([t, Paragraph(paper["table_caption"], S["cap"])]))
            table_done = True
    story.append(Paragraph("References", S["h1"]))
    for k, ref in enumerate(paper["references"], 1):
        story.append(Paragraph(f"[{k}] {ref}", S["ref"]))
    doc.build(story, onFirstPage=footer(paper["title"]), onLaterPages=footer(paper["title"]))
    pages = doc.page
    return {"pages": pages}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--meta", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    meta = []
    for p in PAPERS:
        for field in ("title", "abstract"):
            assert "\u2014" not in p[field] and "\u2013" not in p[field], f"dash in {p['id']} {field}"
        f = out / f"{p['id']}.pdf"
        info = build(p, f)
        meta.append({
            "id": p["id"], "file": f.name, "pages": info["pages"], "title": p["title"],
            "pubType": p["pub_type"], "typeLabel": p["type"], "status": p["status"], "venue": p["venue"], "year": p["year"],
            "authors": [
                {
                    "fullName": a["name"],
                    "organization": p["affiliations"][a["affil"] - 1],
                    "isCorresponding": bool(a.get("corresponding")),
                }
                for a in p["authors"]
            ],
            "keywords": p["keywords"], "abstract": p["abstract"], "figure": p["figure"],
        })
        print(f"{f.name}: {info['pages']} pages")
    Path(a.meta).write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
