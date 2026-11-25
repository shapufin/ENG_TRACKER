"""Shared ReportLab kit for management PDF reports (TL scorecard, engagement).

Built on the doc / table / page-number approach of the payroll export
(`plugins/payroll/services/export_service.py`), but copied rather than imported:
the payroll plugin must stay removable. reportlab is imported lazily inside each
helper, so importing this module never needs the library.

Every value that reaches a Paragraph goes through `xml.sax.saxutils.escape`:
report cells hold free text (names, reasons, shared summaries), and markup in
them must print as text, never be parsed.
"""
from math import ceil, floor, log10
from xml.sax.saxutils import escape
from core.utils.timezone_local import business_today

MARGIN_MM = 16
HEADER_MM = 22
FOOTER_MM = 16

PALETTE = {
    'ink': '#0F172A',
    'muted': '#475569',
    'neutral': '#64748B',
    'rule': '#CBD5E1',
    'surface': '#F1F5F9',
    'surface_alt': '#F8FAFC',
    'zebra': '#F8FAFC',
    'accent': '#1D4ED8',
    'accent_soft': '#DBEAFE',
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
    'ink': 'ink', 'neutral': 'neutral', 'muted': 'muted', 'accent': 'accent',
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
        'section': ParagraphStyle('ReportSection', parent=base['Heading2'], fontName='Helvetica-Bold',
                                  fontSize=12.5, leading=16, textColor=ink, spaceBefore=10, spaceAfter=5,
                                  keepWithNext=1),
        'sub_section': ParagraphStyle('ReportSubSection', parent=base['Heading3'], fontName='Helvetica-Bold',
                                      fontSize=9.5, leading=13, textColor=ink, spaceBefore=6, spaceAfter=3,
                                      keepWithNext=1),
        'chart_title': ParagraphStyle('ReportChartTitle', parent=base['Normal'], fontName='Helvetica-Bold',
                                      fontSize=9.5, leading=12, textColor=ink, spaceBefore=3, spaceAfter=1,
                                      keepWithNext=1),
        'body': ParagraphStyle('ReportBody', parent=base['Normal'], fontSize=9, leading=12,
                               textColor=ink, spaceAfter=4),
        'caption': ParagraphStyle('ReportCaption', parent=base['Normal'], fontSize=8,
                                  leading=10.5, textColor=muted, spaceAfter=4, keepWithNext=1),
        'kpi_label': ParagraphStyle('ReportKpiLabel', parent=base['Normal'], fontName='Helvetica-Bold',
                                    fontSize=7.5, leading=10, textColor=muted, spaceAfter=2),
        'kpi_value': ParagraphStyle('ReportKpiValue', parent=base['Normal'], fontName='Helvetica-Bold',
                                    fontSize=17, leading=21, textColor=ink),
        'kpi_delta': ParagraphStyle('ReportKpiDelta', parent=base['Normal'], fontSize=7.5,
                                    leading=10, textColor=muted, spaceBefore=2),
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


def _resolve_colour(colour_or_tone: str) -> str:
    if colour_or_tone.startswith('#'):
        return colour_or_tone
    return _tone_colour(colour_or_tone)


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
    generated_on = business_today().strftime('%d %b %Y')
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


def cover_block(story, *, title, subtitle, kpis, cols=2):
    """Title, subtitle and a grid of KPI tiles.

    ``kpis``: ``[(label, value, tone), ...]`` or ``[(label, value, tone, delta), ...]``.
    Each tile renders separate label, value, and optional delta rows inside a nested
    table so tall values never collide with labels, with a tone accent left rule.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = _styles()
    story.append(Paragraph(escape(title), styles['title']))
    story.append(Paragraph(escape(subtitle), styles['subtitle']))
    if not kpis:
        return

    cols = max(1, cols)
    col_w = _content_width_mm() / cols * mm
    inner_w = col_w - 6 * mm
    tiles = []
    tile_tones = []
    for item in kpis:
        label, value, tone = item[0], item[1], item[2]
        delta = item[3] if len(item) > 3 else None
        tone_hex = _tone_colour(tone)
        rows = [
            [Paragraph(escape(label), styles['kpi_label'])],
            [Paragraph(f'<font color="{tone_hex}"><b>{escape(_text(value))}</b></font>', styles['kpi_value'])],
        ]
        if delta:
            rows.append([Paragraph(escape(str(delta)), styles['kpi_delta'])])
        tile_tbl = Table(rows, colWidths=[inner_w])
        tile_tbl.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        tiles.append(tile_tbl)
        tile_tones.append(tone_hex)

    grid = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    tone_grid = [tile_tones[i:i + cols] for i in range(0, len(tile_tones), cols)]
    empty_coords = []
    last_r = len(grid) - 1
    while len(grid[last_r]) < cols:
        c_idx = len(grid[last_r])
        grid[last_r].append('')
        tone_grid[last_r].append(None)
        empty_coords.append((c_idx, last_r))

    table = Table(grid, colWidths=[col_w] * cols)
    cmds = [
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(PALETTE['surface_alt'])),
        ('INNERGRID', (0, 0), (-1, -1), 6, colors.white),
        ('BOX', (0, 0), (-1, -1), 6, colors.white),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    for r_idx, row_tones in enumerate(tone_grid):
        for c_idx, t_hex in enumerate(row_tones):
            if t_hex:
                cmds.append(('LINEBEFORE', (c_idx, r_idx), (c_idx, r_idx), 2.5, colors.HexColor(t_hex)))
    for c_idx, r_idx in empty_coords:
        cmds.append(('BACKGROUND', (c_idx, r_idx), (c_idx, r_idx), colors.white))
    table.setStyle(TableStyle(cmds))
    story.append(Spacer(1, 3 * mm))
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


def sub_section(story, text):
    """Sub-heading bound to the following table or chart via ``keepWithNext``."""
    from reportlab.platypus import Paragraph

    story.append(Paragraph(escape(text), _styles()['sub_section']))


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
        x += stringWidth(name, 'Helvetica', 8) + 24


def _series_colours(series) -> list[str]:
    if len(series) > len(PALETTE['series']):
        raise ValueError('More series than palette slots: fold the extras into "Other" or split the chart.')
    return PALETTE['series'][:len(series)]


def _chart_drawing(height_mm):
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib.units import mm

    return Drawing(_content_width_mm() * mm, height_mm * mm)


def _chart_box(drawing, *, horizontal=False, categories=(), has_legend=True, has_right_axis=False):
    """Chart area inside the drawing, sizing margins dynamically for horizontal labels and legend."""
    from reportlab.pdfbase.pdfmetrics import stringWidth

    width = drawing.width
    height = drawing.height
    x0 = 34.0
    if horizontal and categories:
        max_w = max(stringWidth(str(c), 'Helvetica', 7.5) for c in categories)
        x0 = max(44.0, min(155.0, max_w + 14.0))
    y0 = 30.0 if has_legend else 20.0
    right_margin = 34.0 if has_right_axis else 14.0
    top_margin = 14.0
    return x0, y0, width - x0 - right_margin, height - y0 - top_margin


def _nice_ticks(low: float, high: float, *, integer: bool = False) -> list:
    """Compute 2..5 clean, human-round axis ticks covering [low, high]."""
    if integer:
        low_i = int(min(0, low))
        high_i = max(low_i + 1, ceil(high))
        span = high_i - low_i
        if span <= 4:
            return list(range(low_i, high_i + 1))
        step = max(1, ceil(span / 4))
        top = low_i + step * ceil(span / step)
        return list(range(low_i, top + 1, step))
    if high <= low:
        high = low + 1
    raw_step = (high - low) / 4
    mag = 10 ** floor(log10(raw_step))
    norm = raw_step / mag
    for nice in (1.0, 2.0, 2.5, 5.0, 10.0):
        if norm <= nice:
            step = nice * mag
            break
    else:
        step = 10.0 * mag
    start = floor(low / step) * step
    ticks = []
    cur = start
    while cur < high - 1e-9:
        ticks.append(round(cur, 6))
        cur += step
    ticks.append(round(cur, 6))
    return ticks


def _draw_thresholds(drawing, thresholds, x0, width, ypos, y0, height):
    """Draw dashed horizontal benchmark/target lines with right-aligned micro labels."""
    from reportlab.graphics.shapes import Line, String
    from reportlab.lib import colors

    if not thresholds:
        return
    for val, label, tone in thresholds:
        y = ypos(val)
        if y < y0 - 1 or y > y0 + height + 1:
            continue
        col = colors.HexColor(_resolve_colour(tone))
        drawing.add(Line(x0, y, x0 + width, y, strokeColor=col, strokeWidth=0.75, strokeDashArray=[3, 3]))
        if label:
            drawing.add(String(x0 + 3, y + 2, str(label), textAnchor='start',
                               fontName='Helvetica-Bold', fontSize=6.5, fillColor=col))


def _add_chart(story, drawing, *, title=None, subtitle=None):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer

    styles = _styles()
    # Keep title -> caption -> drawing chained via keepWithNext=1 (no KeepTogether
    # wrapper) so an immediately preceding section_title stays glued to the chart.
    if title:
        story.append(Paragraph(escape(title), styles['chart_title']))
    if subtitle:
        story.append(Paragraph(escape(subtitle), styles['caption']))
    story.append(drawing)
    story.append(Spacer(1, 3.5 * mm))


def _format_tick(value, suffix: str) -> str:
    if isinstance(value, int):
        return f'{value}{suffix}'
    return f'{round(value, 2):g}{suffix}'


def line_chart(
    story, *, categories, series, y_max=None, y_suffix="", height_mm=58,
    title=None, subtitle=None, thresholds=None, fill_area=False,
    show_values=False, integer_y=False, colours_override=None,
):
    """Line chart drawn from shapes, so ``None`` is a true gap (no zero-fill).

    Supports area fill under the first series (``fill_area``), benchmark
    ``thresholds=[(val, label, tone)]``, integer Y ticks, and point labels.
    """
    from reportlab.graphics.shapes import Circle, Line, Polygon, PolyLine, String
    from reportlab.lib import colors

    colours = colours_override or _series_colours(series)
    has_legend = len(series) > 1
    drawing = _chart_drawing(height_mm)
    x0, y0, width, height = _chart_box(drawing, has_legend=has_legend)
    values = [v for row in series.values() for v in row if v is not None]
    if thresholds:
        values = values + [t[0] for t in thresholds]
    low = min(0, min(values)) if values else 0
    raw_high = y_max if y_max is not None else (max(values) if values else 1)
    ticks = _nice_ticks(low, raw_high, integer=integer_y)
    low, high = ticks[0], ticks[-1]
    if high <= low:
        high = low + 1
    n = max(1, len(categories))

    def ypos(value):
        return y0 + (value - low) / (high - low) * height

    def xpos(index):
        return x0 + (index + 0.5) * width / n

    rule = colors.HexColor(PALETTE['rule'])
    muted = colors.HexColor(PALETTE['muted'])
    for val in ticks:
        y = ypos(val)
        drawing.add(Line(x0, y, x0 + width, y, strokeColor=rule, strokeWidth=0.3))
        drawing.add(String(x0 - 4, y - 2.5, _format_tick(val, y_suffix), textAnchor='end',
                           fontName='Helvetica', fontSize=7, fillColor=muted))
    for index, category in enumerate(categories):
        drawing.add(String(xpos(index), y0 - 11, str(category), textAnchor='middle',
                           fontName='Helvetica', fontSize=7, fillColor=muted))

    for s_idx, (colour_name, row) in enumerate(zip(colours, series.values())):
        colour = colors.HexColor(_resolve_colour(colour_name))
        run = []
        for index, value in enumerate(list(row) + [None]):
            if value is not None:
                run.append((xpos(index), ypos(value)))
                continue
            if fill_area and s_idx == 0 and len(run) >= 2:
                poly_pts = [run[0][0], y0]
                for px, py in run:
                    poly_pts.extend([px, py])
                poly_pts.extend([run[-1][0], y0])
                drawing.add(Polygon(poly_pts, fillColor=colors.HexColor(PALETTE['accent_soft']),
                                    strokeColor=None))
            if len(run) >= 2:
                flat = [coord for point in run for coord in point]
                drawing.add(PolyLine(flat, strokeColor=colour, strokeWidth=2))
            run = []

    # Draw thresholds after area fills so dashed benchmark lines remain visible on top.
    _draw_thresholds(drawing, thresholds, x0, width, ypos, y0, height)

    for s_idx, (colour_name, row) in enumerate(zip(colours, series.values())):
        colour = colors.HexColor(_resolve_colour(colour_name))
        for index, value in enumerate(row):
            if value is not None:
                px, py = xpos(index), ypos(value)
                drawing.add(Circle(px, py, 2.5, fillColor=colour, strokeColor=colors.white, strokeWidth=0.6))
                if show_values:
                    lbl = f'{int(value) if integer_y and float(value).is_integer() else round(value, 1):g}{y_suffix}'
                    # Put multi-series lower points or ceiling values below the dot to prevent overlap.
                    below = py > y0 + height - 8
                    if len(series) == 2:
                        other_vals = [list(series.values())[1 - s_idx][index]]
                        if other_vals[0] is not None and value < other_vals[0]:
                            below = True
                    dy = -9 if below else 5
                    drawing.add(String(px, py + dy, lbl, textAnchor='middle',
                                       fontName='Helvetica-Bold', fontSize=6.5, fillColor=colour))
    if has_legend:
        _legend(drawing, list(series), [_resolve_colour(c) for c in colours], x0, 5)
    _add_chart(story, drawing, title=title, subtitle=subtitle)


def combo_chart(
    story, *, categories, area_series, line_series,
    y_max=100, y2_max=None, y_suffix="", y2_suffix="",
    thresholds=None, height_mm=60, title=None, subtitle=None,
):
    """Dual-axis combo chart: primary area+line on left Y, secondary dashed line on right Y2."""
    from reportlab.graphics.shapes import Circle, Line, Polygon, PolyLine, String
    from reportlab.lib import colors

    area_name, area_vals = area_series
    line_name, line_vals = line_series
    c_primary = PALETTE['series'][0]
    c_secondary = PALETTE['series'][2]
    drawing = _chart_drawing(height_mm)
    x0, y0, width, height = _chart_box(drawing, has_legend=True, has_right_axis=True)

    y1_vals = [v for v in area_vals if v is not None] + ([t[0] for t in thresholds] if thresholds else [])
    y1_ticks = _nice_ticks(0, y_max if y_max is not None else (max(y1_vals) if y1_vals else 100))
    y1_low, y1_high = y1_ticks[0], y1_ticks[-1]

    y2_vals = [v for v in line_vals if v is not None]
    raw_y2 = y2_max if y2_max is not None else (max(y2_vals) * 1.15 if y2_vals else 1)
    y2_ticks = _nice_ticks(0, raw_y2)
    y2_low, y2_high = y2_ticks[0], y2_ticks[-1]

    n = max(1, len(categories))

    def xpos(i):
        return x0 + (i + 0.5) * width / n

    def ypos1(v):
        return y0 + (v - y1_low) / max(1e-9, y1_high - y1_low) * height

    def ypos2(v):
        return y0 + (v - y2_low) / max(1e-9, y2_high - y2_low) * height

    rule = colors.HexColor(PALETTE['rule'])
    muted = colors.HexColor(PALETTE['muted'])
    for t1, t2 in zip(y1_ticks, y2_ticks):
        y = ypos1(t1)
        drawing.add(Line(x0, y, x0 + width, y, strokeColor=rule, strokeWidth=0.3))
        drawing.add(String(x0 - 4, y - 2.5, _format_tick(t1, y_suffix), textAnchor='end',
                           fontName='Helvetica', fontSize=7, fillColor=muted))
        drawing.add(String(x0 + width + 4, y - 2.5, _format_tick(t2, y2_suffix), textAnchor='start',
                           fontName='Helvetica', fontSize=7, fillColor=colors.HexColor(c_secondary)))

    for idx, cat in enumerate(categories):
        drawing.add(String(xpos(idx), y0 - 11, str(cat), textAnchor='middle',
                           fontName='Helvetica', fontSize=7, fillColor=muted))

    # Primary area + line
    col1 = colors.HexColor(c_primary)
    run = []
    for idx, val in enumerate(list(area_vals) + [None]):
        if val is not None:
            run.append((xpos(idx), ypos1(val)))
            continue
        if len(run) >= 2:
            poly = [run[0][0], y0] + [c for pt in run for c in pt] + [run[-1][0], y0]
            drawing.add(Polygon(poly, fillColor=colors.HexColor(PALETTE['accent_soft']), strokeColor=None))
            drawing.add(PolyLine([c for pt in run for c in pt], strokeColor=col1, strokeWidth=2))
        run = []

    _draw_thresholds(drawing, thresholds, x0, width, ypos1, y0, height)

    for idx, val in enumerate(area_vals):
        if val is not None:
            px, py = xpos(idx), ypos1(val)
            drawing.add(Circle(px, py, 2.5, fillColor=col1, strokeColor=colors.white, strokeWidth=0.6))
            drawing.add(String(px, py + 5, f'{round(val, 1):g}{y_suffix}', textAnchor='middle',
                               fontName='Helvetica-Bold', fontSize=6.5, fillColor=col1))

    # Secondary dashed line
    col2 = colors.HexColor(c_secondary)
    run2 = []
    for idx, val in enumerate(list(line_vals) + [None]):
        if val is not None:
            run2.append((xpos(idx), ypos2(val)))
            continue
        if len(run2) >= 2:
            drawing.add(PolyLine([c for pt in run2 for c in pt], strokeColor=col2, strokeWidth=1.75,
                                 strokeDashArray=[4, 2]))
        run2 = []
    for idx, val in enumerate(line_vals):
        if val is not None:
            px, py = xpos(idx), ypos2(val)
            drawing.add(Circle(px, py, 2.2, fillColor=colors.white, strokeColor=col2, strokeWidth=1.4))

    _legend(drawing, [area_name, line_name], [c_primary, c_secondary], x0, 5)
    _add_chart(story, drawing, title=title, subtitle=subtitle)


def bar_chart(
    story, *, categories, series, horizontal=False, y_max=None, y_suffix="",
    height_mm=56, title=None, subtitle=None, integer_y=False,
    show_values=False, bar_colors=None, thresholds=None,
):
    """Grouped bar chart (vertical, or horizontal with categories top-down).

    Supports ``integer_y=True`` (no decimal ticks on counts), ``bar_colors``
    for per-category severity colouring on single-series bars, and value labels.
    """
    from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
    from reportlab.graphics.shapes import Line, String
    from reportlab.lib import colors

    colours = _series_colours(series)
    has_legend = len(series) > 1
    drawing = _chart_drawing(height_mm)
    chart = HorizontalBarChart() if horizontal else VerticalBarChart()
    x0, y0, width, height = _chart_box(
        drawing, horizontal=horizontal, categories=categories, has_legend=has_legend,
    )
    chart.x, chart.y, chart.width, chart.height = x0, y0, width, height
    chart.data = [list(values) for values in series.values()]
    chart.categoryAxis.categoryNames = [str(c) for c in categories]

    all_values = [v for values in series.values() for v in values if v is not None]
    if thresholds:
        all_values = all_values + [t[0] for t in thresholds]
    raw_low = min(0, min(all_values)) if all_values else 0
    raw_high = y_max if y_max is not None else (max(all_values) if all_values else 1)
    ticks = _nice_ticks(raw_low, raw_high, integer=integer_y)
    chart.valueAxis.valueMin = ticks[0]
    chart.valueAxis.valueMax = ticks[-1]
    if len(ticks) >= 2:
        chart.valueAxis.valueStep = ticks[1] - ticks[0]

    muted = colors.HexColor(PALETTE['muted'])
    for axis in (chart.valueAxis, chart.categoryAxis):
        axis.labels.fontName = 'Helvetica'
        axis.labels.fontSize = 7
        axis.labels.fillColor = muted
    chart.categoryAxis.labels.dy = -2 if not horizontal else 0
    if horizontal:
        chart.categoryAxis.labels.dx = -4
        chart.categoryAxis.reverseDirection = 1
    chart.valueAxis.labelTextFormat = lambda v: _format_tick(
        int(round(v)) if integer_y and abs(v - round(v)) < 1e-6 else v, y_suffix,
    )
    chart.valueAxis.strokeColor = colors.HexColor(PALETTE['rule'])
    chart.categoryAxis.strokeColor = colors.HexColor(PALETTE['rule'])
    chart.barSpacing = 2
    chart.groupSpacing = 8

    for index, colour in enumerate(colours):
        chart.bars[index].fillColor = colors.HexColor(colour)
        chart.bars[index].strokeColor = None
    if bar_colors and len(series) == 1:
        for cat_idx, col_or_tone in enumerate(bar_colors[:len(categories)]):
            chart.bars[(0, cat_idx)].fillColor = colors.HexColor(_resolve_colour(col_or_tone))
            chart.bars[(0, cat_idx)].strokeColor = None

    if show_values:
        chart.barLabels.nudge = 0 if horizontal else 5
        if horizontal:
            chart.barLabels.boxAnchor = 'w'
            chart.barLabels.dx = 4
        chart.barLabelFormat = (
            lambda v: '' if v is None else _format_tick(
                int(round(v)) if integer_y and abs(v - round(v)) < 1e-6 else round(v, 1), y_suffix,
            )
        )
        chart.barLabels.fontName = 'Helvetica-Bold'
        chart.barLabels.fontSize = 6.5
        chart.barLabels.fillColor = colors.HexColor(PALETTE['ink'])

    drawing.add(chart)

    if thresholds and not horizontal:
        def ypos(v):
            return y0 + (v - ticks[0]) / max(1e-9, ticks[-1] - ticks[0]) * height

        _draw_thresholds(drawing, thresholds, x0, width, ypos, y0, height)
    elif thresholds and horizontal:
        for val, label, tone in thresholds:
            tx = x0 + (val - ticks[0]) / max(1e-9, ticks[-1] - ticks[0]) * width
            if x0 <= tx <= x0 + width:
                col = colors.HexColor(_resolve_colour(tone))
                drawing.add(Line(tx, y0, tx, y0 + height, strokeColor=col, strokeWidth=0.75,
                                 strokeDashArray=[3, 3]))
                if label:
                    drawing.add(String(tx - 2, y0 + height - 7, str(label), textAnchor='end',
                                       fontName='Helvetica-Bold', fontSize=6.5, fillColor=col))

    if has_legend:
        _legend(drawing, list(series), colours, x0, 5)
    _add_chart(story, drawing, title=title, subtitle=subtitle)


def stacked_bar_chart(
    story, *, categories, series, colors_override=None, overlay_line=None,
    integer_y=True, height_mm=58, title=None, subtitle=None,
):
    """Stacked vertical bar chart with optional overlay line (e.g. Submitted total)."""
    from reportlab.graphics.shapes import Circle, Line, PolyLine, Rect, String
    from reportlab.lib import colors

    colours = [_resolve_colour(c) for c in (colors_override or _series_colours(series))]
    n = max(1, len(categories))
    totals = [
        sum((vals[i] or 0) for vals in series.values())
        for i in range(n)
    ]
    all_high = max(totals) if totals else 1
    if overlay_line:
        ov_vals = [v for v in overlay_line[1] if v is not None]
        if ov_vals:
            all_high = max(all_high, max(ov_vals))

    drawing = _chart_drawing(height_mm)
    has_legend = len(series) > 1 or overlay_line is not None
    x0, y0, width, height = _chart_box(drawing, has_legend=has_legend)
    ticks = _nice_ticks(0, all_high, integer=integer_y)
    low, high = ticks[0], ticks[-1]

    def ypos(v):
        return y0 + (v - low) / max(1e-9, high - low) * height

    slot_w = width / n
    bar_w = min(28.0, slot_w * 0.55)
    rule = colors.HexColor(PALETTE['rule'])
    muted = colors.HexColor(PALETTE['muted'])
    for t in ticks:
        y = ypos(t)
        drawing.add(Line(x0, y, x0 + width, y, strokeColor=rule, strokeWidth=0.3))
        drawing.add(String(x0 - 4, y - 2.5, _format_tick(t, ''), textAnchor='end',
                           fontName='Helvetica', fontSize=7, fillColor=muted))

    for i, cat in enumerate(categories):
        cx = x0 + (i + 0.5) * slot_w
        drawing.add(String(cx, y0 - 11, str(cat), textAnchor='middle',
                           fontName='Helvetica', fontSize=7, fillColor=muted))
        cum = 0.0
        for s_col, vals in zip(colours, series.values()):
            v = vals[i] or 0
            if v <= 0:
                continue
            yb = ypos(cum)
            yt = ypos(cum + v)
            drawing.add(Rect(cx - bar_w / 2, yb, bar_w, max(0.5, yt - yb),
                             fillColor=colors.HexColor(s_col), strokeColor=colors.white, strokeWidth=0.5))
            cum += v
        if cum > 0:
            drawing.add(String(cx, ypos(cum) + 3, _format_tick(int(cum) if integer_y else cum, ''),
                               textAnchor='middle', fontName='Helvetica-Bold', fontSize=6.5,
                               fillColor=colors.HexColor(PALETTE['ink'])))

    legend_names = list(series.keys())
    legend_cols = list(colours)
    if overlay_line:
        ov_name, ov_vals = overlay_line
        ov_col = PALETTE['ink']
        run = []
        for idx, val in enumerate(list(ov_vals) + [None]):
            if val is not None:
                run.append((x0 + (idx + 0.5) * slot_w, ypos(val)))
                continue
            if len(run) >= 2:
                drawing.add(PolyLine([c for pt in run for c in pt],
                                     strokeColor=colors.HexColor(ov_col), strokeWidth=1.5, strokeDashArray=[3, 2]))
            run = []
        for idx, val in enumerate(ov_vals):
            if val is not None:
                px, py = x0 + (idx + 0.5) * slot_w, ypos(val)
                drawing.add(Circle(px, py, 2.2, fillColor=colors.white,
                                   strokeColor=colors.HexColor(ov_col), strokeWidth=1.3))
        legend_names.append(ov_name)
        legend_cols.append(ov_col)

    if has_legend:
        _legend(drawing, legend_names, legend_cols, x0, 5)
    _add_chart(story, drawing, title=title, subtitle=subtitle)


def donut_chart(story, *, parts, colors_map=None, title=None, height_mm=46):
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
        if title:
            sub_section(story, title)
        story.append(Paragraph('No data recorded.', _styles()['body']))
        return

    if colors_map and all(label in colors_map for label, _count in present):
        colours = [_resolve_colour(colors_map[label]) for label, _count in present]
    else:
        default_cols = _series_colours(present)
        colours = [
            _resolve_colour(colors_map[label]) if colors_map and label in colors_map else default_cols[i]
            for i, (label, _count) in enumerate(present)
        ]
    drawing = _chart_drawing(height_mm)
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
        y = drawing.height - 11 * mm - index * 8 * mm
        share = round(count / total * 100)
        drawing.add(Rect(64 * mm, y - 1, 8, 8, fillColor=colors.HexColor(colours[index]),
                         strokeColor=None))
        drawing.add(String(74 * mm, y, f'{label}: {count} ({share}%)', fontName='Helvetica',
                           fontSize=9, fillColor=colors.HexColor(PALETTE['ink'])))
    _add_chart(story, drawing, title=title)
