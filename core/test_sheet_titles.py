"""Sheet titles must be legal for openpyxl and unique inside one workbook."""
from django.test import SimpleTestCase

from core.utils.sheet_titles import FALLBACK_TITLE, MAX_TITLE_LENGTH, safe_sheet_title


class SafeSheetTitleTests(SimpleTestCase):
    def test_illegal_characters_are_removed(self):
        # openpyxl raises on any of []:*?/\ — a TL named "Ops / Night" must not.
        self.assertEqual(safe_sheet_title('Ops / Night'), 'Ops  Night')
        self.assertEqual(safe_sheet_title('A[B]C:D*E?F\\G'), 'ABCDEFG')

    def test_titles_are_truncated_to_the_excel_limit(self):
        self.assertEqual(len(safe_sheet_title('x' * 80)), MAX_TITLE_LENGTH)

    def test_empty_or_blank_names_fall_back(self):
        self.assertEqual(safe_sheet_title(''), FALLBACK_TITLE)
        self.assertEqual(safe_sheet_title('   '), FALLBACK_TITLE)
        self.assertEqual(safe_sheet_title('///'), FALLBACK_TITLE)
        self.assertEqual(safe_sheet_title(None), FALLBACK_TITLE)

    def test_duplicates_are_suffixed_and_stay_within_the_limit(self):
        used: set[str] = set()
        first = safe_sheet_title('Team', used)
        second = safe_sheet_title('Team', used)
        third = safe_sheet_title('Team', used)
        self.assertEqual([first, second, third], ['Team', 'Team (2)', 'Team (3)'])

    def test_a_collision_after_truncation_still_differs(self):
        # Two 40-character names that share their first 31 characters used to
        # silently overwrite each other's sheet.
        used: set[str] = set()
        first = safe_sheet_title('A' * 31 + 'one', used)
        second = safe_sheet_title('A' * 31 + 'two', used)
        self.assertNotEqual(first, second)
        self.assertEqual(len(first), MAX_TITLE_LENGTH)
        self.assertTrue(second.endswith('(2)'))
        self.assertLessEqual(len(second), MAX_TITLE_LENGTH)

    def test_without_a_used_set_it_stays_a_pure_sanitiser(self):
        self.assertEqual(safe_sheet_title('Team'), 'Team')
        self.assertEqual(safe_sheet_title('Team'), 'Team')
