"""
Renders diagnostic Reading staging CSVs as a clean, readable PDF: passage
text followed by its questions (with options and the correct answer marked),
grouped by set — the actual exam content, not the verification report.

Usage:
    python scripts/seeders-ai/readingCsvToPdf.py <out.pdf> <file1.csv> [file2.csv ...]
"""
import sys
import csv
import json
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from xml.sax.saxutils import escape


def build(out_path, csv_paths):
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=15, spaceAfter=8, textColor=colors.HexColor('#12283f'))
    set_title = ParagraphStyle('SetTitle', parent=styles['Heading2'], fontSize=13, spaceBefore=6, spaceAfter=6, textColor=colors.HexColor('#1a3a5c'))
    passage_style = ParagraphStyle('Passage', parent=styles['Normal'], fontSize=10, leading=15, spaceAfter=10,
                                    backColor=colors.HexColor('#f5f5f0'), borderPadding=8)
    q_style = ParagraphStyle('Q', parent=styles['Normal'], fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3, fontName='Helvetica-Bold')
    opt_style = ParagraphStyle('Opt', parent=styles['Normal'], fontSize=10, leading=13, leftIndent=16, spaceAfter=1)
    opt_correct_style = ParagraphStyle('OptCorrect', parent=opt_style, textColor=colors.HexColor('#0a7a2f'), fontName='Helvetica-Bold')
    answer_style = ParagraphStyle('Answer', parent=styles['Normal'], fontSize=9.5, leading=12, leftIndent=16, spaceAfter=6, textColor=colors.HexColor('#0a7a2f'), fontName='Helvetica-Bold')

    doc = SimpleDocTemplate(out_path, pagesize=letter,
                             topMargin=0.7 * inch, bottomMargin=0.7 * inch,
                             leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                             title="Diagnostic Reading Content")

    story = []
    story.append(Paragraph("Diagnostic Reading — Question Sets", h1))
    story.append(Spacer(1, 6))

    first_set_overall = True
    for path in csv_paths:
        with open(path, encoding='utf-8-sig') as fh:
            rows = list(csv.DictReader(fh))

        sets = {}
        order = []
        for r in rows:
            sid = r['set_id']
            if sid not in sets:
                sets[sid] = []
                order.append(sid)
            sets[sid].append(r)

        for sid in order:
            set_rows = sorted(sets[sid], key=lambda r: int(r['sequence']))
            if not first_set_overall:
                story.append(PageBreak())
            first_set_overall = False

            story.append(Paragraph(f"Set: {sid}", set_title))
            passage = set_rows[0].get('passage_text', '').strip()
            if passage:
                story.append(Paragraph(escape(passage), passage_style))

            for r in set_rows:
                qtype = r['question_type']
                seq = r['sequence']
                prompt = escape(r['prompt_text'])
                story.append(Paragraph(f"{seq}. {prompt}", q_style))

                correct = r['correct_answer'].strip().upper()
                if qtype == 'MCQ':
                    opts = json.loads(r['options']) if r['options'].strip() else {}
                    for key in ['A', 'B', 'C', 'D']:
                        text = escape(opts.get(key, ''))
                        style = opt_correct_style if key == correct else opt_style
                        marker = '✓ ' if key == correct else ''
                        story.append(Paragraph(f"{marker}{key}) {text}", style))
                elif qtype == 'TFNG':
                    label = {'T': 'True', 'F': 'False', 'NG': 'Not Given'}.get(correct, correct)
                    story.append(Paragraph(f"(True / False / Not Given)", opt_style))
                    story.append(Paragraph(f"Correct answer: {label}", answer_style))
                    continue

                story.append(Paragraph(f"Correct answer: {correct}", answer_style))

            story.append(Spacer(1, 4))
            story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#cccccc')))

    doc.build(story)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python readingCsvToPdf.py <out.pdf> <file1.csv> [file2.csv ...]')
        sys.exit(1)
    build(sys.argv[1], sys.argv[2:])
    print(f'Wrote {sys.argv[1]}')
