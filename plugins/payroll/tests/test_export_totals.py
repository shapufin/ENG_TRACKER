"""The payroll Excel export and PDF agree with the lines and the run totals they summarise."""
import io
from datetime import date, time
from decimal import Decimal

import openpyxl
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.overtime.models import Client, OvertimeLog
from apps.standby.models import StandbyLog
from plugins.payroll.models import PayrollConfiguration, PayrollLine, PayrollRun, PayrollRuleSet, WageAssignment
from plugins.payroll.services.payroll_service import finalize_run, generate_draft_run

User = get_user_model()


class PayrollExportTotalsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={
            'require_tl_closed_before_finalize': False,
            'weekday_standby_hourly_rate': Decimal('100'), 'weekend_standby_hourly_rate': Decimal('150'),
        })
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser(username='pt_admin', email='a@t.com', password='x')
        client = Client.objects.create(name='C', code='C')
        cls.users = []
        for i, wage in enumerate((90000, 120000, 150000)):
            user = User.objects.create_user(username=f'pt_{i}', password='x', first_name=f'U{i}', last_name='T')
            WageAssignment.objects.create(
                user=user, gross_monthly_wage=Decimal(wage), effective_from=date(2026, 1, 1), is_active=True,
            )
            cls.users.append(user)
        # June 2026: overtime on a weekday evening, a Sunday and an overnight; standby too.
        for user, day, start, end in (
            (cls.users[0], date(2026, 6, 3), time(19, 0), time(21, 0)),
            (cls.users[0], date(2026, 6, 7), time(9, 0), time(13, 0)),     # Sunday
            (cls.users[1], date(2026, 6, 10), time(23, 0), time(1, 0)),    # overnight
            (cls.users[2], date(2026, 6, 12), time(18, 0), time(20, 30)),
        ):
            OvertimeLog.objects.create(
                user=user, client=client, date=day, start_time=start, end_time=end, hours=1, description='x',
                status='approved', requested_processing_period=date(2026, 6, 1),
            )
        StandbyLog.objects.create(
            user=cls.users[1], date=date(2026, 6, 15), start_time=time(18, 0), end_time=time(0, 0), hours=Decimal('6'),
            status='approved', description='x', requested_processing_period=date(2026, 6, 1),
        )
        run = PayrollRun.objects.create(
            year=2026, month=6, status='draft', rule_set=PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE'),
            created_by=cls.admin,
        )
        generate_draft_run(run, cls.users)
        cls.payrun = finalize_run(run, cls.admin)

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.admin)

    def _sheets(self):
        response = self.api.get(f'/api/plugins/payroll/runs/{self.payrun.pk}/export_excel/')
        self.assertEqual(response.status_code, 200)
        wb = openpyxl.load_workbook(io.BytesIO(b''.join(response.streaming_content)), data_only=True)
        return {ws.title: list(ws.iter_rows(values_only=True)) for ws in wb.worksheets}

    def _employee_rows(self):
        rows = self._sheets()['Employee Breakdown']
        header = rows[0]
        return header, {r[0]: dict(zip(header, r)) for r in rows[1:]}

    def test_summary_equals_the_sum_of_the_employee_rows_and_the_run_totals(self):
        sheets = self._sheets()
        summary = {row[0]: row[1] for row in sheets['Summary'][7:15] if row[0]}
        _, employees = self._employee_rows()
        for label, column in (('Total Gross', 'Total Gross'), ('Total Net Pay', 'Net Pay'), ('Total Overtime', 'Overtime Amount'),
                              ('Total Employee Deductions', 'Total Deductions')):
            self.assertAlmostEqual(summary[label], sum(r[column] for r in employees.values()), delta=1, msg=label)
        self.assertEqual(summary['Employee Count'], len(employees))
        totals = self.payrun.totals
        self.assertAlmostEqual(summary['Total Gross'], float(totals['total_gross']), delta=1)
        self.assertAlmostEqual(summary['Total Net Pay'], float(totals['total_net']), delta=1)
        self.assertAlmostEqual(summary['Total Employer Cost'], float(totals['total_employer_cost']), delta=1)

    def test_each_employee_row_matches_its_payroll_line_and_the_arithmetic_holds(self):
        _, employees = self._employee_rows()
        for line in PayrollLine.objects.filter(run=self.payrun).select_related('user'):
            row = employees[f'{line.user.first_name} {line.user.last_name}']
            self.assertEqual(row['Overtime Hours'], float(line.overtime_hours))
            self.assertEqual(row['Standby Hours'], float(line.standby_hours))
            self.assertAlmostEqual(row['Overtime Amount'], float(line.overtime_amount), delta=1)
            self.assertAlmostEqual(row['Standby Amount'], float(line.standby_amount), delta=1)
            self.assertAlmostEqual(
                row['Total Gross'], row['Gross Wage'] + row['Overtime Amount'] + row['Standby Amount'], delta=1,   # carry-over is part of these, never added again
            )
            self.assertAlmostEqual(row['Net Pay'], row['Total Gross'] - row['Total Deductions'], delta=1)
            self.assertAlmostEqual(
                row['Total Deductions'], row['Employee Social'] + row['Employee Health'] + row['Income Tax'], delta=1,
            )

    def test_overtime_and_standby_hours_equal_the_approved_source_entries(self):
        _, employees = self._employee_rows()
        for user in self.users:
            row = employees[f'{user.first_name} {user.last_name}']
            source = sum(o.hours for o in OvertimeLog.objects.filter(user=user, status='approved'))
            self.assertEqual(Decimal(str(row['Overtime Hours'])), source, user.username)
            self.assertEqual(
                Decimal(str(row['Standby Hours'])),
                sum(s.hours for s in StandbyLog.objects.filter(user=user, status='approved')), user.username,
            )

    def test_the_detail_sheets_add_up_to_the_summary_rows(self):
        sheets = self._sheets()
        _, employees = self._employee_rows()
        detail_hours, detail_amount = {}, {}
        for user, _cat, hours, _mult, amount, *_ in sheets['Overtime Detail'][1:]:
            detail_hours[user] = detail_hours.get(user, 0) + hours
            detail_amount[user] = detail_amount.get(user, 0) + amount
        entry_hours = {}
        for employee, _day, _window, _entries, _worked, paid in sheets['Overtime Entries'][1:]:
            entry_hours[employee] = entry_hours.get(employee, 0) + paid
        for name, row in employees.items():
            if row['Overtime Hours']:
                self.assertEqual(detail_hours[name], row['Overtime Hours'], name)
                self.assertEqual(entry_hours[name], row['Overtime Hours'], name)
                self.assertAlmostEqual(detail_amount[name], row['Overtime Amount'], delta=1, msg=name)

    def test_the_pdf_export_is_a_pdf_for_a_finalized_run(self):
        response = self.api.get(f'/api/plugins/payroll/runs/{self.payrun.pk}/export_pdf/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(response.streaming_content).startswith(b'%PDF'))

    def test_each_payslip_prints_the_amounts_of_its_payroll_line(self):
        """The PDF people are paid by carries the line's numbers (audit 2026-11-17, money)."""
        from pypdf import PdfReader

        from plugins.payroll.services.export_service import _money, generate_payslip_pdf

        for line in PayrollLine.objects.filter(run=self.payrun).select_related('user', 'run'):
            text = ' '.join(
                page.extract_text() for page in PdfReader(generate_payslip_pdf(line)).pages
            )
            for label, amount in (
                ('wage', line.gross_monthly_wage), ('gross', line.total_gross),
                ('income tax', line.income_tax), ('deductions', line.total_employee_deductions),
                ('net pay', line.net_pay),
            ):
                self.assertIn(_money(amount), text, f'{line.user.username}: {label}')
            if line.overtime_amount:
                self.assertIn(_money(line.overtime_amount), text, f'{line.user.username}: overtime')
            # Every field is rounded on its own (calculator step 10), so net pay can differ from the
            # printed gross minus deductions by one unit. Owner/accountant decision D4 (open).
            self.assertLessEqual(
                abs(line.total_gross - line.total_employee_deductions - line.net_pay), Decimal('1'),
                line.user.username,
            )


class CarriedOverEntriesTests(TestCase):
    """An entry approved after its month was finalized is paid in the next run: once, and it shows everywhere."""

    @classmethod
    def setUpTestData(cls):
        PayrollConfiguration.objects.update_or_create(pk=1, defaults={'require_tl_closed_before_finalize': False})
        call_command('seed_payroll_rules', verbosity=0)
        cls.admin = User.objects.create_superuser(username='co_admin', email='a@t.com', password='x')
        cls.user = User.objects.create_user(username='co_emp', password='x', first_name='Co', last_name='Emp')
        WageAssignment.objects.create(
            user=cls.user, gross_monthly_wage=Decimal('100000'), effective_from=date(2026, 1, 1), is_active=True,
        )
        cls.client_obj = Client.objects.create(name='C', code='C')
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        cls.regular = cls._entry(date(2026, 5, 5), time(19, 0), time(21, 0), date(2026, 5, 1))
        may = PayrollRun.objects.create(year=2026, month=5, status='draft', rule_set=rule_set, created_by=cls.admin)
        generate_draft_run(may, [cls.user])
        finalize_run(may, cls.admin)
        # Approved late: it belongs to May, which is closed, so the June run pays it.
        cls.late = cls._entry(date(2026, 5, 29), time(19, 0), time(22, 0), date(2026, 5, 1))
        cls.june_own = cls._entry(date(2026, 6, 9), time(19, 0), time(21, 0), date(2026, 6, 1))
        StandbyLog.objects.create(
            user=cls.user, date=date(2026, 5, 30), start_time=time(18, 0), end_time=time(0, 0), hours=Decimal('6'),
            status='approved', description='x', requested_processing_period=date(2026, 5, 1),
        )
        june = PayrollRun.objects.create(year=2026, month=6, status='draft', rule_set=rule_set, created_by=cls.admin)
        generate_draft_run(june, [cls.user])
        cls.june = finalize_run(june, cls.admin)

    @classmethod
    def _entry(cls, day, start, end, period):
        return OvertimeLog.objects.create(
            user=cls.user, client=cls.client_obj, date=day, start_time=start, end_time=end, hours=1,
            description='x', status='approved', requested_processing_period=period,
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=self.admin)

    def test_the_june_line_pays_its_own_hours_plus_the_carried_ones_once(self):
        line = PayrollLine.objects.get(run=self.june)
        self.assertEqual(line.overtime_hours, Decimal('5'))       # 2 of June + 3 carried from 29 May

    def test_the_payroll_excel_lists_the_carried_entry_and_the_totals_still_add_up(self):
        response = self.api.get(f'/api/plugins/payroll/runs/{self.june.pk}/export_excel/')
        wb = openpyxl.load_workbook(io.BytesIO(b''.join(response.streaming_content)), data_only=True)
        carry = list(wb['Carryover Detail'].iter_rows(min_row=2, values_only=True))
        self.assertEqual(len(carry), 1)
        self.assertEqual((carry[0][6], carry[0][8]), (3, 6))      # carried overtime hours, carried standby hours
        employees = {r[0]: r for r in wb['Employee Breakdown'].iter_rows(min_row=2, values_only=True)}
        row = employees['Co Emp']
        self.assertEqual((row[2], row[4]), (5, 6))                # hours columns: own + carried overtime, carried standby
        self.assertAlmostEqual(row[7], row[1] + row[3] + row[5], delta=1)   # gross = wage + OT + standby: carried is not added twice
        entries = list(wb['Overtime Entries'].iter_rows(min_row=2, values_only=True))
        self.assertEqual(sum(e[5] for e in entries), 5)           # paid hours of every listed entry

    def test_a_later_run_does_not_pay_it_again(self):
        rule_set = PayrollRuleSet.objects.get(code='AL_2026_BOSHTI_REFERENCE')
        july = PayrollRun.objects.create(year=2026, month=7, status='draft', rule_set=rule_set, created_by=self.admin)
        generate_draft_run(july, [self.user])
        self.assertEqual(PayrollLine.objects.get(run=july).overtime_hours, Decimal('0'))

    def test_the_payroll_period_exports_list_each_entry_once_under_its_requested_period(self):
        # date_mode=processing_period filters by the REQUESTED period (documented): the late May entry is in
        # May's export and is not repeated in June's.
        from apps.reports.test_export_integrity import _sheet_rows, _workbook

        def rows(month_start, month_end):
            response = self.api.get('/api/reports/export-ot-standby/', {
                'start_date': month_start, 'end_date': month_end, 'date_mode': 'processing_period',
            })
            return [r for rs in _sheet_rows(_workbook(response)).values() for r in rs]
        may, june = rows('2026-05-01', '2026-05-31'), rows('2026-06-01', '2026-06-30')
        self.assertEqual(sorted(r[1] for r in may), ['05/05/2026', '29/05/2026', '30/05/2026'])
        self.assertEqual(sorted(r[1] for r in june), ['09/06/2026'])
        # (where it was paid is in the payroll Excel's Carryover Detail, not in this file: the settlement is
        # only used to keep paid-block bundling from merging rows across settlements)
