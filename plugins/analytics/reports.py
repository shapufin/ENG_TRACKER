import pandas as pd
import io
from datetime import timedelta, datetime

from django.utils import timezone



class AnalyticsReportGenerator:
    """
    Generator for multi-sheet enterprise reports (Excel, CSV, PDF).
    """

    @classmethod
    def get_date_range(cls, period='month', date_from=None, date_to=None):
        now = timezone.now()
        if date_from and date_to:
            from django.utils.dateparse import parse_date
            # Parse date-only strings and return date objects for bucket filtering
            start_date_obj = parse_date(date_from)
            end_date_obj = parse_date(date_to)
            if start_date_obj and end_date_obj:
                return start_date_obj, end_date_obj
            # else fall through to period-based default

        if period == 'week':
            start_date = (now - timedelta(days=7)).date()
        elif period == 'year':
            start_date = (now - timedelta(days=365)).date()
        else:
            start_date = (now - timedelta(days=30)).date()
        return start_date, now.date()

    @classmethod
    def _build_filtered_data(cls, period, date_from, date_to, teams, users, statuses, categories):
        """
        Build the three filtered querysets shared by every report format.

        Centralises filter logic (previously duplicated across excel/csv/pdf)
        and applies query optimisations:
          - team filtering resolves to user IDs (avoids M2M join row duplication
            that inflates count()/Sum())
          - select_related/prefetch_related to avoid N+1 on user/team/client access

        Returns: (start_date, end_date, leave_data, overtime_data, standby_data,
                  include_leave, include_overtime, include_standby)
        """
        from django.db.models import Q
        from apps.leave_management.models import LeaveRequest
        from apps.overtime.models import OvertimeLog
        from apps.standby.models import StandbyLog

        start_date, end_date = cls.get_date_range(period, date_from, date_to)
        start_dt = timezone.make_aware(datetime.combine(start_date, datetime.min.time()))
        end_dt = timezone.make_aware(datetime.combine(end_date, datetime.max.time()))

        leave_filters = Q(created_at__gte=start_dt, created_at__lte=end_dt)
        overtime_filters = Q(date__gte=start_date, date__lte=end_date)
        standby_filters = Q(date__gte=start_date, date__lte=end_date)

        if teams:
            from apps.users.models.core import UserProfile
            team_user_ids = list(
                UserProfile.objects.filter(teams__name__in=teams)
                .values_list('user_id', flat=True)
                .distinct()
            )
            leave_filters &= Q(user_id__in=team_user_ids)
            overtime_filters &= Q(user_id__in=team_user_ids)
            standby_filters &= Q(user_id__in=team_user_ids)

        if users:
            leave_filters &= Q(user_id__in=users)
            overtime_filters &= Q(user_id__in=users)
            standby_filters &= Q(user_id__in=users)

        if statuses:
            leave_filters &= Q(status__in=statuses)
            overtime_filters &= Q(status__in=statuses)
            standby_filters &= Q(status__in=statuses)

        if categories:
            include_leave = 'leave' in categories
            include_overtime = 'overtime' in categories
            include_standby = 'standby' in categories
        else:
            include_leave = include_overtime = include_standby = True

        if include_leave:
            leave_data = (LeaveRequest.objects.filter(leave_filters)
                          .select_related('user', 'user__profile')
                          .prefetch_related('user__profile__teams'))
        else:
            leave_data = LeaveRequest.objects.none()

        if include_overtime:
            overtime_data = (OvertimeLog.objects.filter(overtime_filters)
                             .select_related('user', 'user__profile', 'client')
                             .prefetch_related('user__profile__teams'))
        else:
            overtime_data = OvertimeLog.objects.none()

        if include_standby:
            standby_data = (StandbyLog.objects.filter(standby_filters)
                            .select_related('user', 'user__profile')
                            .prefetch_related('user__profile__teams'))
        else:
            standby_data = StandbyLog.objects.none()

        return (start_date, end_date, leave_data, overtime_data, standby_data,
                include_leave, include_overtime, include_standby)

    @staticmethod
    def _daily_summary_rows(start_date, end_date, leave_data, overtime_data, standby_data,
                            include_leave, include_overtime, include_standby):
        """
        Aggregate per-day totals at the database level (one grouped query per
        dataset) instead of issuing per-day .filter() calls.

        Leave Days counts business days (Mon–Fri) spanned by each leave
        request, matching the HR Leave Excel export and the
        ``count_business_days`` invariant. A 5-day leave request
        contributes 1 to each of its 5 business days, not 1 to its
        creation date.
        """
        from collections import defaultdict
        from django.db.models import Sum

        leave_by_date = defaultdict(int)
        if include_leave:
            for lr in leave_data:
                lr_start = lr.start_date
                lr_end = lr.end_date
                if lr_start is None or lr_end is None:
                    continue
                # Clamp to the report window
                day = max(lr_start, start_date)
                stop = min(lr_end, end_date)
                while day <= stop:
                    if day.weekday() < 5:  # Mon–Fri
                        leave_by_date[day] += 1
                    day += timedelta(days=1)

        ot_by_date = {}
        if include_overtime:
            for row in (overtime_data.values('date')
                        .annotate(h=Sum('hours'))):
                ot_by_date[row['date']] = row['h'] or 0

        sb_by_date = {}
        if include_standby:
            for row in (standby_data.values('date')
                        .annotate(h=Sum('hours'))):
                sb_by_date[row['date']] = row['h'] or 0

        rows = []
        current_date = start_date
        while current_date <= end_date:
            rows.append({
                'Date': current_date,
                'Leave Days': leave_by_date.get(current_date, 0),
                'OT Hours': float(ot_by_date.get(current_date, 0)),
                'Standby Hours': float(sb_by_date.get(current_date, 0)),
            })
            current_date += timedelta(days=1)
        return rows

    @staticmethod
    def _team_name_for(obj):
        """Resolve a user's team name using prefetched teams (no extra query)."""
        profile = getattr(obj.user, 'profile', None)
        if not profile:
            return 'Unassigned'
        teams = list(profile.teams.all())
        return teams[0].name if teams else 'Unassigned'

    @staticmethod
    def _user_display_name(user):
        """Resolve a user's display name (full name → username)."""
        full = user.get_full_name()
        return full if full else user.username

    @classmethod
    def _user_summary_rows(cls, leave_data, overtime_data, standby_data,
                           include_leave, include_overtime, include_standby):
        """Build per-user aggregated rows for the User Breakdown sheet.

        One row per user with OT hours, standby hours, leave days (business
        days), and leave count — all within the filtered period. Uses the
        prefetched ``select_related('user', 'user__profile')`` +
        ``prefetch_related('user__profile__teams')`` from
        ``_build_filtered_data`` to avoid N+1.
        """
        from collections import defaultdict

        user_stats = defaultdict(lambda: {
            'User': '', 'Username': '', 'Team': 'Unassigned',
            'OT Hours': 0.0, 'Standby Hours': 0.0,
            'Leave Days': 0, 'Leave Count': 0,
        })

        def _ensure(user):
            key = user.id
            if user_stats[key]['User'] == '':
                user_stats[key]['User'] = cls._user_display_name(user)
                user_stats[key]['Username'] = user.username
                profile = getattr(user, 'profile', None)
                if profile:
                    teams = list(profile.teams.all())
                    user_stats[key]['Team'] = teams[0].name if teams else 'Unassigned'
            return user_stats[key]

        if include_overtime:
            for log in overtime_data:
                stats = _ensure(log.user)
                stats['OT Hours'] += float(log.hours)

        if include_standby:
            for log in standby_data:
                stats = _ensure(log.user)
                stats['Standby Hours'] += float(log.hours)

        if include_leave:
            for req in leave_data:
                stats = _ensure(req.user)
                stats['Leave Count'] += 1
                # Business days (Mon–Fri) — matches count_business_days invariant
                if req.start_date and req.end_date:
                    day = req.start_date
                    stop = req.end_date
                    while day <= stop:
                        if day.weekday() < 5:
                            stats['Leave Days'] += 1
                        day += timedelta(days=1)

        return list(user_stats.values())

    @classmethod
    def _raw_records_rows(cls, leave_data, overtime_data, standby_data,
                          include_leave, include_overtime, include_standby):
        """Build per-record rows for the Raw Records sheet.

        Every OT, standby, and leave record in the filtered set, with user,
        date, category, hours/days, status, team, and client. This is the
        full drill-down — one row per record, not aggregated.
        """
        rows = []

        if include_overtime:
            for log in overtime_data:
                rows.append({
                    'User': cls._user_display_name(log.user),
                    'Username': log.user.username,
                    'Team': cls._team_name_for(log),
                    'Category': 'Overtime',
                    'Date': log.date,
                    'Hours': float(log.hours),
                    'Leave Days': '',
                    'Status': log.status,
                    'Client': log.client.name if log.client else '',
                    'Description': log.description or '',
                })

        if include_standby:
            for log in standby_data:
                rows.append({
                    'User': cls._user_display_name(log.user),
                    'Username': log.user.username,
                    'Team': cls._team_name_for(log),
                    'Category': 'Standby',
                    'Date': log.date,
                    'Hours': float(log.hours),
                    'Leave Days': '',
                    'Status': log.status,
                    'Client': '',
                    'Description': log.description or '',
                })

        if include_leave:
            for req in leave_data:
                leave_days = 0
                if req.start_date and req.end_date:
                    day = req.start_date
                    stop = req.end_date
                    while day <= stop:
                        if day.weekday() < 5:
                            leave_days += 1
                        day += timedelta(days=1)
                rows.append({
                    'User': cls._user_display_name(req.user),
                    'Username': req.user.username,
                    'Team': cls._team_name_for(req),
                    'Category': 'Leave',
                    'Date': req.start_date,
                    'Hours': '',
                    'Leave Days': leave_days,
                    'Status': req.status,
                    'Client': '',
                    'Description': req.reason or '',
                })

        return rows

    @classmethod
    def generate_excel_report(cls, period='month', date_from=None, date_to=None,
                              teams=None, users=None, statuses=None, categories=None):
        (start_date, end_date, leave_data, overtime_data, standby_data,
         include_leave, include_overtime, include_standby) = cls._build_filtered_data(
            period, date_from, date_to, teams, users, statuses, categories)

        # Handle empty data
        if not leave_data.exists() and not overtime_data.exists() and not standby_data.exists():
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                pd.DataFrame(columns=['Date', 'Leave Days', 'OT Hours', 'Standby Hours']).to_excel(
                    writer, sheet_name='Daily Summary', index=False)
            output.seek(0)
            return output.getvalue()

        # 1. Daily Summary Sheet (DB-aggregated)
        df_summary = pd.DataFrame(cls._daily_summary_rows(
            start_date, end_date, leave_data, overtime_data, standby_data,
            include_leave, include_overtime, include_standby))

        # 2. User Breakdown Sheet (per-user aggregated)
        df_user = pd.DataFrame(cls._user_summary_rows(
            leave_data, overtime_data, standby_data,
            include_leave, include_overtime, include_standby))

        # 3. Raw Records Sheet (every record with full detail)
        df_raw = pd.DataFrame(cls._raw_records_rows(
            leave_data, overtime_data, standby_data,
            include_leave, include_overtime, include_standby))

        # 4. Client Breakdown Sheet
        client_rows = []
        for log in (overtime_data if include_overtime else []):
            client_rows.append({
                'Date': log.date,
                'Client': log.client.name if log.client else 'Unassigned',
                'Hours': float(log.hours),
            })
        df_client = pd.DataFrame(client_rows)

        # Create Excel file in memory
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_summary.to_excel(writer, sheet_name='Daily Summary', index=False)
            if not df_user.empty:
                df_user.to_excel(writer, sheet_name='User Breakdown', index=False)
            if not df_raw.empty:
                df_raw.to_excel(writer, sheet_name='Raw Records', index=False)
            if not df_client.empty:
                df_client.to_excel(writer, sheet_name='Client Breakdown', index=False)

            # Auto-adjust column widths
            for sheetname in writer.sheets:
                worksheet = writer.sheets[sheetname]
                for col in worksheet.columns:
                    max_length = 0
                    column = col[0].column_letter
                    for cell in col:
                        try:
                            if len(str(cell.value)) > max_length:
                                max_length = len(str(cell.value))
                        except Exception:
                            pass
                    worksheet.column_dimensions[column].width = max_length + 2

            # Add native Excel charts to a dedicated Charts sheet
            cls._add_charts_sheet(writer, df_summary, df_user,
                                  include_leave, include_overtime, include_standby)

        output.seek(0)
        return output.getvalue()

    @staticmethod
    def _add_charts_sheet(writer, df_summary, df_user,
                          include_leave, include_overtime, include_standby):
        """
        Add a 'Charts' sheet with native openpyxl charts:

        1. Daily Trend (LineChart): OT Hours + Standby Hours over time
        2. User Breakdown (BarChart): OT + Standby hours per user (top 10)
        3. Category Distribution (PieChart): total OT vs Standby vs Leave Days

        Charts reference data in the Daily Summary and User Breakdown sheets
        via openpyxl Reference objects. They are native Excel chart objects
        (not images) — fully interactive in Excel/LibreOffice/Google Sheets.
        """
        from openpyxl.chart import LineChart, BarChart, PieChart, Reference
        from openpyxl.chart.series import DataPoint

        wb = writer.book
        charts_ws = wb.create_sheet('Charts')
        chart_row = 1  # track vertical placement for multiple charts

        # ── 1. Daily Trend Line Chart ──────────────────────────────
        if not df_summary.empty and len(df_summary) > 1:
            summary_ws = writer.sheets['Daily Summary']
            n_rows = len(df_summary)

            line = LineChart()
            line.title = "Daily Trend: OT & Standby Hours"
            line.style = 10
            line.y_axis.title = 'Hours'
            line.x_axis.title = 'Date'
            line.height = 8
            line.width = 20

            # Date labels (column A, rows 2..n+1)
            cats = Reference(summary_ws, min_col=1, min_row=2, max_row=n_rows + 1)

            # OT Hours (column C) and Standby Hours (column D)
            col_idx = 3  # column C = OT Hours
            if include_overtime:
                data = Reference(summary_ws, min_col=col_idx, min_row=1, max_row=n_rows + 1)
                line.add_data(data, titles_from_data=True)
                line.series[-1].graphicalProperties.line.solidFill = "2196F3"
            col_idx += 1
            if include_standby:
                data = Reference(summary_ws, min_col=col_idx, min_row=1, max_row=n_rows + 1)
                line.add_data(data, titles_from_data=True)
                line.series[-1].graphicalProperties.line.solidFill = "FF9800"

            if line.series:
                line.set_categories(cats)
                charts_ws.add_chart(line, f"A{chart_row}")
                chart_row += 16

        # ── 2. User Breakdown Bar Chart (top 10) ───────────────────
        if not df_user.empty:
            user_ws = writer.sheets.get('User Breakdown')
            if user_ws:
                # Sort by OT Hours descending, take top 10
                df_user_sorted = df_user.sort_values(
                    by='OT Hours', ascending=False
                ).head(10)
                n_users = len(df_user_sorted)

                # Write a temp data block on the Charts sheet for the bar chart.
                # Place it in far-right columns (AA+) and hide them so the
                # data powers the chart but isn't visible to the user.
                data_start_col = 27  # column AA
                start_row = chart_row + 1
                charts_ws.cell(row=start_row, column=data_start_col, value='User')
                charts_ws.cell(row=start_row, column=data_start_col + 1, value='OT Hours')
                charts_ws.cell(row=start_row, column=data_start_col + 2, value='Standby Hours')
                for idx, (_, row) in enumerate(df_user_sorted.iterrows()):
                    r = start_row + 1 + idx
                    charts_ws.cell(row=r, column=data_start_col, value=row['User'])
                    charts_ws.cell(row=r, column=data_start_col + 1, value=float(row['OT Hours']))
                    charts_ws.cell(row=r, column=data_start_col + 2, value=float(row['Standby Hours']))

                # Hide the temp data columns
                for c in range(data_start_col, data_start_col + 3):
                    charts_ws.column_dimensions[
                        charts_ws.cell(row=1, column=c).column_letter
                    ].hidden = True

                bar = BarChart()
                bar.type = "bar"
                bar.style = 10
                bar.title = "Top 10 Users: OT & Standby Hours"
                bar.y_axis.title = 'User'
                bar.x_axis.title = 'Hours'
                bar.height = 10
                bar.width = 20

                data = Reference(charts_ws, min_col=data_start_col + 1,
                                 max_col=data_start_col + 2,
                                 min_row=start_row, max_row=start_row + n_users)
                cats = Reference(charts_ws, min_col=data_start_col,
                                 min_row=start_row + 1, max_row=start_row + n_users)
                bar.add_data(data, titles_from_data=True)
                bar.set_categories(cats)
                bar.shape = 4
                charts_ws.add_chart(bar, f"E{chart_row}")
                chart_row += 20

        # ── 3. Category Distribution Pie Chart ─────────────────────
        totals = {}
        if include_overtime and not df_summary.empty:
            totals['Overtime'] = float(df_summary['OT Hours'].sum())
        if include_standby and not df_summary.empty:
            totals['Standby'] = float(df_summary['Standby Hours'].sum())
        if include_leave and not df_summary.empty:
            totals['Leave Days'] = float(df_summary['Leave Days'].sum())

        # Only add pie if we have 2+ categories with non-zero values
        non_zero = {k: v for k, v in totals.items() if v > 0}
        if len(non_zero) >= 2:
            pie_data_col = 27  # column AA (hidden, same as bar chart data)
            pie_row = chart_row + 1
            charts_ws.cell(row=pie_row, column=pie_data_col, value='Category')
            charts_ws.cell(row=pie_row, column=pie_data_col + 1, value='Total')
            for idx, (cat, val) in enumerate(non_zero.items()):
                r = pie_row + 1 + idx
                charts_ws.cell(row=r, column=pie_data_col, value=cat)
                charts_ws.cell(row=r, column=pie_data_col + 1, value=val)

            # Hide the temp data columns (may already be hidden from bar chart)
            for c in range(pie_data_col, pie_data_col + 2):
                charts_ws.column_dimensions[
                    charts_ws.cell(row=1, column=c).column_letter
                ].hidden = True

            pie = PieChart()
            pie.title = "Category Distribution"
            pie.height = 8
            pie.width = 12

            data = Reference(charts_ws, min_col=pie_data_col + 1, min_row=pie_row,
                             max_row=pie_row + len(non_zero))
            cats = Reference(charts_ws, min_col=pie_data_col, min_row=pie_row + 1,
                             max_row=pie_row + len(non_zero))
            pie.add_data(data, titles_from_data=True)
            pie.set_categories(cats)

            # Color the pie slices
            colors = ['2196F3', 'FF9800', '4CAF50']
            if pie.series:
                series = pie.series[0]
                for idx in range(len(non_zero)):
                    pt = DataPoint(idx=idx)
                    pt.graphicalProperties.solidFill = colors[idx % len(colors)]
                    series.data_points.append(pt)

            charts_ws.add_chart(pie, f"A{chart_row}")

    @classmethod
    def generate_csv_report(cls, period='month', date_from=None, date_to=None,
                            teams=None, users=None, statuses=None, categories=None):
        """Export the User Breakdown sheet as CSV.

        The CSV format exports the per-user aggregated breakdown (the most
        useful single-sheet view for insight). For the full multi-sheet
        report with daily summary + raw records, use the Excel format.
        """
        (start_date, end_date, leave_data, overtime_data, standby_data,
         include_leave, include_overtime, include_standby) = cls._build_filtered_data(
            period, date_from, date_to, teams, users, statuses, categories)

        df = pd.DataFrame(cls._user_summary_rows(
            leave_data, overtime_data, standby_data,
            include_leave, include_overtime, include_standby))
        output = io.StringIO()
        df.to_csv(output, index=False)
        return output.getvalue()

    @classmethod
    def generate_pdf_report(cls, period='month', date_from=None, date_to=None,
                            teams=None, users=None, statuses=None, categories=None):
        (start_date, end_date, leave_data, overtime_data, standby_data,
         include_leave, include_overtime, include_standby) = cls._build_filtered_data(
            period, date_from, date_to, teams, users, statuses, categories)

        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas

            output = io.BytesIO()
            p = canvas.Canvas(output, pagesize=letter)
            p.drawString(100, 750, f"Analytics Report ({period})")
            p.drawString(100, 735, f"Date Range: {date_from} to {date_to}")
            p.drawString(100, 720, f"Leave Records: {leave_data.count()}")
            p.drawString(100, 705, f"Overtime Records: {overtime_data.count()}")
            p.drawString(100, 690, f"Standby Records: {standby_data.count()}")
            p.drawString(100, 675, "Full enterprise PDF generation requires additional layout configuration.")
            p.showPage()
            p.save()

            output.seek(0)
            return output.getvalue()
        except ImportError:
            return b"PDF generation requires reportlab library. Please install it with: pip install reportlab"
