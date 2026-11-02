"""Labels shown to users for roles whose stored name differs from what we display.

Display-only: role codes (``italian_tl`` / ``albanian_tl``), database rows and
API parameters are unchanged. Every serializer that emits a role name goes
through ``role_display_name`` so the label cannot drift between screens.
"""

ROLE_DISPLAY_NAMES = {
    "italian_tl": "Manager",
    "albanian_tl": "Line Manager",
}


def role_display_name(code, stored_name):
    return ROLE_DISPLAY_NAMES.get(code, stored_name)
