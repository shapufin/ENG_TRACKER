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
                row['Total Gross'], row['Gross Wage'] + row['Overtime Amount'] + row['Standby Amount'] + row['Carryover Amount'], delta=1,
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
