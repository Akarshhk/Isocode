"""Converts docs/TDD.md to a Word document (the submission format).

Handles the subset of Markdown the TDD uses: headings, paragraphs, bullet and numbered lists,
pipe tables, fenced code blocks, **bold**, `code` and links written as plain URLs.
Usage: python scripts/md_to_docx.py docs/TDD.md TDD.docx
"""
import re
import sys

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

BRAND = RGBColor(0x1D, 0x5C, 0x48)
INK = RGBColor(0x1B, 0x1D, 0x1E)
MUTED = RGBColor(0x4A, 0x4F, 0x53)


def add_inline(par, text, size=None):
    """Adds text with **bold** and `code` runs."""
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**"):
            run = par.add_run(part[2:-2])
            run.bold = True
        elif part.startswith("`") and part.endswith("`"):
            run = par.add_run(part[1:-1])
            run.font.name = "Consolas"
            run.font.size = Pt(9)
        else:
            run = par.add_run(part)
        if size and not (part.startswith("`")):
            run.font.size = size


def shade(cell, hex_fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tc_pr.append(shd)


def add_table(doc, rows):
    header, body = rows[0], rows[1:]
    table = doc.add_table(rows=1, cols=len(header))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(header):
        cell = table.rows[0].cells[i]
        cell.text = ""
        add_inline(cell.paragraphs[0], h, Pt(9))
        for r in cell.paragraphs[0].runs:
            r.bold = True
        shade(cell, "E5EFEA")
    for row in body:
        cells = table.add_row().cells
        for i, value in enumerate(row[: len(header)]):
            cells[i].text = ""
            add_inline(cells[i].paragraphs[0], value, Pt(9))
    doc.add_paragraph()


def parse_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def main(src, dst):
    doc = Document()
    for section in doc.sections:
        section.left_margin = section.right_margin = Cm(2.2)
        section.top_margin = section.bottom_margin = Cm(2)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    for name, size in (("Heading 1", 20), ("Heading 2", 14), ("Heading 3", 12)):
        st = doc.styles[name]
        st.font.name = "Calibri"
        st.font.size = Pt(size)
        st.font.color.rgb = BRAND if name != "Heading 3" else INK
        st.font.bold = True

    lines = open(src, encoding="utf-8").read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            p = doc.add_paragraph()
            run = p.add_run("\n".join(block))
            run.font.name = "Consolas"
            run.font.size = Pt(7.5)
            run.font.color.rgb = MUTED
            i += 1
            continue
        if line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|\s*:?-{2,}", lines[i]):
                    rows.append(parse_row(lines[i]))
                i += 1
            add_table(doc, rows)
            continue
        m = re.match(r"^(#{1,3}) (.*)", line)
        if m:
            doc.add_heading(m.group(2), level=len(m.group(1)))
        elif re.match(r"^\s{2,}- ", line):
            add_inline(doc.add_paragraph(style="List Bullet 2"), line.strip()[2:])
        elif re.match(r"^- ", line):
            add_inline(doc.add_paragraph(style="List Bullet"), line[2:])
        elif re.match(r"^\d+\. ", line):
            add_inline(doc.add_paragraph(style="List Number"), re.sub(r"^\d+\. ", "", line))
        elif line.strip():
            add_inline(doc.add_paragraph(), line)
        i += 1
    doc.save(dst)
    print(f"Wrote {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
