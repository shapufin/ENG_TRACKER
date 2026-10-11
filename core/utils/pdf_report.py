"""Shared ReportLab kit for management PDF reports (TL scorecard, engagement).

Built on the doc / table / page-number approach of the payroll export
(`plugins/payroll/services/export_service.py`), but copied rather than imported:
the payroll plugin must stay removable. reportlab is imported lazily inside each
helper, so importing this module never needs the library.

Every value that reaches a Paragraph goes through `xml.sax.saxutils.escape`:
report cells hold free text (names, reasons, shared summaries), and markup in
them must print as text, never be parsed.
"""
from datetime import date
from xml.sax.saxutils import escape

MARGIN_MM = 16
HEADER_MM = 22
FOOTER_MM = 16

PALETTE = {
    'ink': '#0F172A',
    'muted': '#475569',
    'rule': '#CBD5E1',
    'surface': '#F1F5F9',
    'zebra': '#F8FAFC',
    'accent': '#1D4ED8',
    'success': '#15803D',
    'warning': '#B45309',
    'danger': '#B91C1C',
    # Categorical series, fixed order (never cycled). The first four slots of the
    # dataviz reference palette, light mode. `validate_palette.js --mode light`:
    # adjacent CVD dE 9.1, normal-vision dE 22.9, PASS; contrast WARN on slots 3-4,
    # so every chart built here ships a legend and a data table (relief rule).
    'series': ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
}

_TONES = {
    'ink': 'ink', 'neutral': 'ink', 'muted': 'muted', 'accent': 'accent',
    'success': 'success', 'warning': 'warning', 'danger': 'danger',
}


def _content_width_mm() -> float:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm

    return (A4[0] - 2 * MARGIN_MM * mm) / mm


def _styles() -> dict:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    base = getSampleStyleSheet()
    ink = colors.HexColor(PALETTE['ink'])
    muted = colors.HexColor(PALETTE['muted'])
    return {
        'title': ParagraphStyle('ReportTitle', parent=base['Title'], fontSize=20, leading=24,
                                alignment=0, textColor=ink, spaceAfter=2),
        'subtitle': ParagraphStyle('ReportSubtitle', parent=base['Normal'], fontSize=10,
                                   leading=13, textColor=muted, spaceAfter=8),
        'section': ParagraphStyle('ReportSection', parent=base['Heading2'], fontSize=13,
                                  leading=16, textColor=ink, spaceBefore=10, spaceAfter=6,
                                  keepWithNext=1),
        'body': ParagraphStyle('ReportBody', parent=base['Normal'], fontSize=9, leading=12,
                               textColor=ink, spaceAfter=4),
        'caption': ParagraphStyle('ReportCaption', parent=base['Normal'], fontSize=8,
                                  leading=10, textColor=muted, spaceAfter=6),
        'cell': ParagraphStyle('ReportCell', parent=base['Normal'], fontSize=8.5, leading=10.5,
                               textColor=ink),
        'cell_right': ParagraphStyle('ReportCellRight', parent=base['Normal'], fontSize=8.5,
                                     leading=10.5, textColor=ink, alignment=TA_RIGHT),
        'head': ParagraphStyle('ReportHead', parent=base['Normal'], fontName='Helvetica-Bold',
                               fontSize=8.5, leading=10.5, textColor=colors.white),
        'head_right': ParagraphStyle('ReportHeadRight', parent=base['Normal'],
                                     fontName='Helvetica-Bold', fontSize=8.5, leading=10.5,
                                     textColor=colors.white, alignment=TA_RIGHT),
    }


def _text(value) -> str:
    return '—' if value is None else str(value)


def _tone_colour(tone: str) -> str:
    return PALETTE[_TONES.get(tone, 'ink')]


def new_report(buffer, *, title, subtitle, generated_by, period_label):
    """A4 portrait report with a header band (title left, period right) and a
    footer ("Generated {date} · by {name} · Page N") on every page.

    Returns ``(doc, story, styles)``. The caller appends with the helpers below
    and finishes with ``doc.build(story)``.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

    page_width, page_height = A4
    margin = MARGIN_MM * mm
    generated_on = date.today().strftime('%d %b %Y')
    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=HEADER_MM * mm, bottomMargin=FOOTER_MM * mm,
        title=title, author=generated_by, subject=subtitle,
    )
    frame = Frame(
        margin, FOOTER_MM * mm,
        page_width - 2 * margin, page_height - (HEADER_MM + FOOTER_MM) * mm,
        id='body', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )

    def _decorate(canvas, doc_):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor(PALETTE['surface']))
        canvas.rect(0, page_height - HEADER_MM * mm, page_width, HEADER_MM * mm,
                    stroke=0, fill=1)
        canvas.setFillColor(colors.HexColor(PALETTE['ink']))
        canvas.setFont('Helvetica-Bold', 10)
        canvas.drawString(margin, page_height - 9 * mm, title)
        canvas.setFillColor(colors.HexColor(PALETTE['muted']))
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(page_width - margin, page_height - 9 * mm, period_label)
        canvas.setStrokeColor(colors.HexColor(PALETTE['rule']))
        canvas.setLineWidth(0.5)
        canvas.line(margin, FOOTER_MM * mm - 3 * mm, page_width - margin, FOOTER_MM * mm - 3 * mm)
        canvas.setFont('Helvetica', 8)
        canvas.drawString(margin, 9 * mm, f'Generated {generated_on} · by {generated_by}')
        canvas.drawRightString(page_width - margin, 9 * mm, f'Page {doc_.page}')
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id='report', frames=[frame], onPage=_decorate)])
    return doc, [], _styles()


def cover_block(story, *, title, subtitle, kpis):
    """Title, subtitle and a two-column grid of KPI tiles.

    ``kpis``: ``[(label, value, tone), ...]``. ``tone`` is one of
    ink/neutral/muted/accent/success/warning/danger. ``value`` is shown as text.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = _styles()
    story.append(Paragraph(escape(title), styles['title']))
    story.append(Paragraph(escape(subtitle), styles['subtitle']))
    if not kpis:
        return

    tiles = [
        Paragraph(
            f'<font size="8" color="{PALETTE["muted"]}">{escape(label)}</font><br/>'
            f'<font size="18" color="{_tone_colour(tone)}"><b>{escape(_text(value))}</b></font>',
            styles['body'],
        )
        for label, value, tone in kpis
    ]
    grid = [tiles[i:i + 2] for i in range(0, len(tiles), 2)]
    if len(grid[-1]) == 1:
        grid[-1].append('')
    half = _content_width_mm() / 2 * mm
    table = Table(grid, colWidths=[half, half])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(PALETTE['surface'])),
        ('INNERGRID', (0, 0), (-1, -1), 6, colors.white),
        ('BOX', (0, 0), (-1, -1), 6, colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(table)
    story.append(Spacer(1, 4 * mm))


def keep_together(story, flowables):
    """Append ``flowables`` as one block that moves to the next page as a whole."""
    from reportlab.platypus import KeepTogether

    story.append(KeepTogether(flowables))


def page_break(story):
    from reportlab.platypus import PageBreak

    story.append(PageBreak())


def section_title(story, text):
    from reportlab.platypus import Paragraph

    story.append(Paragraph(escape(text), _styles()['section']))


def paragraph(story, text):
    from reportlab.platypus import Paragraph

    story.append(Paragraph(escape(text), _styles()['body']))


def data_table(story, header, rows, *, col_widths=None, numeric_cols=()):
    """Zebra table with a coloured header band, repeated on each page.

    ``col_widths`` is in millimetres (defaults to equal columns across the
    content width). ``numeric_cols`` are right-aligned. ``None`` prints as an
    em dash. Every cell is escaped before it becomes a Paragraph.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = _styles()
    numeric = set(numeric_cols)
    data = [[
        Paragraph(escape(_text(h)), styles['head_right' if i in numeric else 'head'])
        for i, h in enumerate(header)
    ]]
    for row in rows:
        data.append([
            Paragraph(escape(_text(v)), styles['cell_right' if i in numeric else 'cell'])
            for i, v in enumerate(row)
        ])
    widths = (
        [w * mm for w in col_widths] if col_widths
        else [_content_width_mm() / len(header) * mm] * len(header)
    )
    table = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(PALETTE['accent'])),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(PALETTE['zebra'])]),
        ('LINEBELOW', (0, 0), (-1, -1), 0.25, colors.HexColor(PALETTE['rule'])),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Spacer(1, 4 * mm))


def _legend(drawing, names, colours, x, y):
    """One row of swatch + label pairs, drawn into a Drawing at (x, y)."""
    from reportlab.graphics.shapes import Rect, String
    from reportlab.lib import colors
    from reportlab.pdfbase.pdfmetrics import stringWidth

    for name, colour in zip(names, colours):
        drawing.add(Rect(x, y, 8, 8, fillColor=colors.HexColor(colour), strokeColor=None))
        drawing.add(String(x + 11, y + 1, name, fontName='Helvetica', fontSize=8,
                           fillColor=colors.HexColor(PALETTE['ink'])))
        x += stringWidth(name, 'Helvetica', 8) + 26


def _series_colours(series) -> list[str]:
    if len(series) > len(PALETTE['series']):
        raise ValueError('More series than palette slots: fold the extras into "Other" or split the chart.')
    return PALETTE['series'][:len(series)]


def _chart_drawing(height_mm):
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.units import mm

    return Drawing(_content_width_mm() * mm, height_mm * mm)


def _chart_box(drawing):
    """Chart area inside the drawing, leaving room for the legend row."""
    width = drawing.width
    height = drawing.height
    return 34, 22, width - 34 - 12, height - 22 - 10


def _add_chart(story, drawing):
    from reportlab.lib.units import mm
    from reportlab.platypus import Spacer

    story.append(drawing)
    story.append(Spacer(1, 4 * mm))


def line_chart(story, *, categories, series, y_max=None, y_suffix="", height_mm=60):
    """Line chart drawn from shapes, so a ``None`` value is a real gap: the line
    breaks there, and nothing is drawn as zero. A lone point is a marker.

    (reportlab's LinePlot drops ``None`` points and joins across the gap, and
    asserts on a series with fewer than two points, so it is not used here.)
    """
    from reportlab.graphics.shapes import Circle, Line, PolyLine, String
    from reportlab.lib import colors

    colours = _series_colours(series)
    drawing = _chart_drawing(height_mm)
    x0, y0, width, height = _chart_box(drawing)
    values = [v for row in series.values() for v in row if v is not None]
    low = min(0, min(values)) if values else 0
    high = y_max if y_max is not None else (max(values) if values else 1)
    if high <= low:
        high = low + 1
    n = len(categories)

    def ypos(value):
        return y0 + (value - low) / (high - low) * height

    def xpos(index):
        return x0 + (index + 0.5) * width / n

    rule = colors.HexColor(PALETTE['rule'])
    muted = colors.HexColor(PALETTE['muted'])
    for step in range(5):
        value = low + (high - low) * step / 4
        y = ypos(value)
        drawing.add(Line(x0, y, x0 + width, y, strokeColor=rule, strokeWidth=0.25))
        drawing.add(String(x0 - 4, y - 3, f'{value:g}{y_suffix}', textAnchor='end',
                           fontName='Helvetica', fontSize=7, fillColor=muted))
    for index, category in enumerate(categories):
        drawing.add(String(xpos(index), y0 - 11, str(category), textAnchor='middle',
                           fontName='Helvetica', fontSize=7, fillColor=muted))

    for colour_name, row in zip(colours, series.values()):
        colour = colors.HexColor(colour_name)
        run = []
        for index, value in enumerate(list(row) + [None]):
            if value is not None:
                run.append((xpos(index), ypos(value)))
                continue
            if len(run) >= 2:
                flat = [coord for point in run for coord in point]
                drawing.add(PolyLine(flat, strokeColor=colour, strokeWidth=2))
            run = []
        for index, value in enumerate(row):
            if value is not None:
                drawing.add(Circle(xpos(index), ypos(value), 2.4, fillColor=colour, strokeColor=None))
    if len(series) > 1:
        _legend(drawing, list(series), colours, x0, 4)
    _add_chart(story, drawing)


def bar_chart(story, *, categories, series, horizontal=False, y_max=None, y_suffix="", height_mm=60):
    """Grouped bar chart (vertical, or horizontal with categories read top-down).
    ``None`` draws no bar."""
    from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
    from reportlab.lib import colors

    colours = _series_colours(series)
    drawing = _chart_drawing(height_mm)
    chart = HorizontalBarChart() if horizontal else VerticalBarChart()
    chart.x, chart.y, chart.width, chart.height = _chart_box(drawing)
    chart.data = [list(values) for values in series.values()]
    chart.categoryAxis.categoryNames = list(categories)
    all_values = [v for values in series.values() for v in values if v is not None]
    chart.valueAxis.valueMin = min(0, min(all_values)) if all_values else 0
    if y_max is not None:
        chart.valueAxis.valueMax = y_max
    chart.valueAxis.labelTextFormat = lambda v: f'{v:g}{y_suffix}'
    chart.valueAxis.strokeColor = colors.HexColor(PALETTE['rule'])
    chart.categoryAxis.strokeColor = colors.HexColor(PALETTE['rule'])
    if horizontal:
        chart.categoryAxis.reverseDirection = 1
    chart.barSpacing = 2
    chart.groupSpacing = 8
    for index, colour in enumerate(colours):
        chart.bars[index].fillColor = colors.HexColor(colour)
        chart.bars[index].strokeColor = None
    drawing.add(chart)
    if len(series) > 1:
        _legend(drawing, list(series), colours, 34, 4)
    _add_chart(story, drawing)


def donut_chart(story, *, parts):
    """Donut of ``{label: count}``. Zero-count parts are left out of the ring and
    the legend; an all-zero set is a plain "No data" line."""
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Circle, Rect, String
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph

    present = [(label, count) for label, count in parts.items() if count]
    total = sum(count for _label, count in present)
    if total == 0:
        story.append(Paragraph('No data recorded.', _styles()['body']))
        return

    colours = _series_colours(present)
    drawing = _chart_drawing(50)
    size = drawing.height - 4 * mm
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 2 * mm, 2 * mm, size, size
    pie.data = [count for _label, count in present]
    pie.slices.strokeColor = colors.white
    pie.slices.strokeWidth = 1
    for index, colour in enumerate(colours):
        pie.slices[index].fillColor = colors.HexColor(colour)
    drawing.add(pie)

    cx = pie.x + size / 2
    cy = pie.y + size / 2
    drawing.add(Circle(cx, cy, size * 0.27, fillColor=colors.white, strokeColor=None))
    drawing.add(String(cx, cy - 4, str(total), textAnchor='middle', fontName='Helvetica-Bold',
                       fontSize=12, fillColor=colors.HexColor(PALETTE['ink'])))

    for index, (label, count) in enumerate(present):
        y = drawing.height - 12 * mm - index * 9 * mm
        share = round(count / total * 100)
        drawing.add(Rect(70 * mm, y - 1, 8, 8, fillColor=colors.HexColor(colours[index]),
                         strokeColor=None))
        drawing.add(String(80 * mm, y, f'{label}: {count} ({share}%)', fontName='Helvetica',
                           fontSize=9, fillColor=colors.HexColor(PALETTE['ink'])))
    _add_chart(story, drawing)
