"""delete_pattern_safe must never raise — see core/utils/cache.py docstring:
a Redis blip here must not turn an otherwise-successful create/update into
a 500 for the caller, since the DB write already committed by the time
this runs (called from perform_create/perform_update, after serializer.save())."""
from unittest.mock import patch

from django.test import TestCase

from core.utils.cache import delete_pattern_safe


class DeletePatternSafeTests(TestCase):
    def test_swallows_redis_backend_errors(self):
        with patch("core.utils.cache.get_cache") as mock_get_cache:
            mock_get_cache.return_value.delete_pattern.side_effect = ConnectionError("redis down")
            delete_pattern_safe("v1:dashboard:*")  # must not raise
