"""CSV downloads of record lists — the single-table counterpart to the XLSX
evidence workbook.

``utf-8-sig`` (BOM) so Excel opens accented characters correctly, following
the data-import template convention in this repo.
"""
import csv
import io
import json

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import ValidationError

CSV_MAX_ROWS = 2000


def _cell(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return str(value)


def build_records_csv(rows):
    """Header + rows from serializer dicts; nested structures become JSON text."""
    rows = list(rows)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    if rows:
        writer.writerow(list(rows[0].keys()))
        for row in rows:
            writer.writerow([_cell(value) for value in row.values()])
    return buffer.getvalue().encode('utf-8-sig')


def csv_download_response(content, filename):
    response = HttpResponse(content, content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class CsvExportMixin:
    """`?file_format=csv` on a record `list` downloads the whole filtered set.

    The rows come from the viewset's own scoped queryset and redacting
    serializer, so a download can never contain more (or less redacted) than
    the JSON list. Anything but ``csv`` is a 400 — the parameter exists only
    for this download.
    """

    csv_filename = 'records'
    csv_max_rows = CSV_MAX_ROWS

    def list(self, request, *args, **kwargs):
        file_format = (request.query_params.get('file_format') or '').lower()
        if not file_format:
            return super().list(request, *args, **kwargs)
        if file_format != 'csv':
            raise ValidationError({'file_format': "Unsupported format. Use 'csv'."})
        qs = self.filter_queryset(self.get_queryset())
        total = qs.count()
        if total > self.csv_max_rows:
            raise ValidationError({
                'file_format': (
                    f'{total} rows exceed the {self.csv_max_rows}-row CSV limit — '
                    'refine the filters.'
                ),
            })
        serializer = self.get_serializer(qs, many=True)
        stamp = timezone.now().strftime('%Y%m%d')
        return csv_download_response(
            build_records_csv(serializer.data), f'{self.csv_filename}-{stamp}.csv')
