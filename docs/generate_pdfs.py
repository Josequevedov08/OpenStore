"""
Genera la documentación completa de OpenStore en PDF, en inglés y español.

Uso:
    python docs/generate_pdfs.py

Requiere solo `reportlab` (ya en el entorno). No depende de pandoc, wkhtmltopdf
ni de fuentes externas — usa las fuentes base de PDF (Helvetica) para que el
script corra en cualquier máquina sin instalar nada más.
"""

import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

PURPLE = colors.HexColor("#7e14ff")
DARK = colors.HexColor("#121218")
GREY = colors.HexColor("#52525b")
LIGHT_GREY = colors.HexColor("#e4e4e7")
BG_CARD = colors.HexColor("#f4f2fb")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_URL = "https://github.com/Josequevedov08/OpenStore"
LIVE_URL = "https://app-repositorio-github-one.vercel.app"


def build_styles():
    ss = getSampleStyleSheet()
    styles = {
        "cover_title": ParagraphStyle(
            "cover_title", parent=ss["Title"], fontName="Helvetica-Bold",
            fontSize=34, leading=40, textColor=DARK, spaceAfter=6,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", parent=ss["Normal"], fontName="Helvetica",
            fontSize=14, leading=20, textColor=GREY, spaceAfter=4,
        ),
        "cover_meta": ParagraphStyle(
            "cover_meta", parent=ss["Normal"], fontName="Helvetica",
            fontSize=10, leading=14, textColor=GREY,
        ),
        "h1": ParagraphStyle(
            "h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
            fontSize=19, leading=23, textColor=DARK, spaceBefore=18, spaceAfter=10,
        ),
        "h2": ParagraphStyle(
            "h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
            fontSize=13.5, leading=17, textColor=PURPLE, spaceBefore=14, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body", parent=ss["Normal"], fontName="Helvetica", fontSize=9.8,
            leading=14.5, textColor=colors.HexColor("#18181b"), spaceAfter=6,
            alignment=TA_LEFT,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=ss["Normal"], fontName="Helvetica", fontSize=9.6,
            leading=14, textColor=colors.HexColor("#18181b"),
        ),
        "mono": ParagraphStyle(
            "mono", parent=ss["Normal"], fontName="Courier", fontSize=8.8,
            leading=13, textColor=colors.HexColor("#3f3f46"),
            backColor=BG_CARD, borderPadding=6,
        ),
        "note": ParagraphStyle(
            "note", parent=ss["Normal"], fontName="Helvetica-Oblique",
            fontSize=9, leading=13, textColor=GREY, spaceBefore=4, spaceAfter=8,
        ),
        "footer": ParagraphStyle(
            "footer", parent=ss["Normal"], fontName="Helvetica", fontSize=7.6,
            leading=10, textColor=GREY,
        ),
        "toc_entry": ParagraphStyle(
            "toc_entry", parent=ss["Normal"], fontName="Helvetica", fontSize=10.5,
            leading=20, textColor=colors.HexColor("#18181b"),
        ),
    }
    return styles


def header_footer(canvas, doc, title, lang):
    canvas.saveState()
    w, h = LETTER
    # Barra superior de marca
    canvas.setFillColor(PURPLE)
    canvas.rect(0, h - 0.55 * cm, w, 0.55 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(1.8 * cm, h - 0.4 * cm, "OpenStore")
    canvas.drawRightString(w - 1.8 * cm, h - 0.4 * cm, title)
    # Pie de página
    canvas.setFillColor(GREY)
    canvas.setFont("Helvetica", 7.6)
    canvas.drawString(1.8 * cm, 1.1 * cm, REPO_URL)
    canvas.drawRightString(w - 1.8 * cm, 1.1 * cm, f"{doc.page}")
    canvas.setStrokeColor(LIGHT_GREY)
    canvas.line(1.8 * cm, 1.35 * cm, w - 1.8 * cm, 1.35 * cm)
    canvas.restoreState()


def make_doc(path, title, lang):
    doc = BaseDocTemplate(
        path, pagesize=LETTER,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.6 * cm, bottomMargin=1.8 * cm,
        title=title, author="Jose Quevedo",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")

    def _on_page(canvas, d):
        header_footer(canvas, d, title, lang)

    template = PageTemplate(id="main", frames=[frame], onPage=_on_page)
    doc.addPageTemplates([template])
    return doc


def cover_page(story, styles, meta):
    story.append(Spacer(1, 3.5 * cm))
    story.append(Paragraph(meta["title"], styles["cover_title"]))
    story.append(Paragraph(meta["subtitle"], styles["cover_sub"]))
    story.append(Spacer(1, 0.6 * cm))
    story.append(HRFlowable(width="100%", thickness=1.4, color=PURPLE))
    story.append(Spacer(1, 0.6 * cm))
    rows = meta["cover_rows"]
    t = Table(rows, colWidths=[3.6 * cm, 12.4 * cm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), PURPLE),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#27272a")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)
    story.append(PageBreak())


def section(story, styles, heading, paragraphs=None, bullets=None, sub=None, code=None, note=None):
    story.append(Paragraph(heading, styles["h1"] if sub is None else styles["h2"]))
    for p in paragraphs or []:
        story.append(Paragraph(p, styles["body"]))
    if bullets:
        items = [ListItem(Paragraph(b, styles["bullet"]), leftIndent=10) for b in bullets]
        story.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=14, spaceBefore=2, spaceAfter=8))
    if code:
        story.append(Paragraph(code.replace("\n", "<br/>"), styles["mono"]))
        story.append(Spacer(1, 6))
    if note:
        story.append(Paragraph(note, styles["note"]))


def build_pdf(path, lang, content):
    styles = build_styles()
    doc = make_doc(path, content["doc_title"], lang)
    story = []
    cover_page(story, styles, content["cover"])
    for sec in content["sections"]:
        section(story, styles, sec.get("h"), sec.get("p"), sec.get("bul"), sec.get("sub"), sec.get("code"), sec.get("note"))
        for sub in sec.get("subsections", []):
            section(story, styles, sub.get("h"), sub.get("p"), sub.get("bul"), True, sub.get("code"), sub.get("note"))
    doc.build(story)
    print("PDF generado:", path)


if __name__ == "__main__":
    from content_en import CONTENT_EN
    from content_es import CONTENT_ES

    out_dir = HERE
    build_pdf(os.path.join(out_dir, "OpenStore-Documentation-EN.pdf"), "en", CONTENT_EN)
    build_pdf(os.path.join(out_dir, "OpenStore-Documentacion-ES.pdf"), "es", CONTENT_ES)
