"""
Importer for the overtime Client catalog.
"""

from typing import Any, Dict, List, Optional

from apps.overtime.models import Client
from .base import ImportField
from .catalog import CodeKeyedImporter
from .authority import StaffOnlyAuthority
from .registry import register


@register
class ClientImporter(StaffOnlyAuthority, CodeKeyedImporter):
    target_key = "clients"
    display_name = "Clients"
    description = "Import or update the client catalog used to categorize overtime."
    icon = "Building2"
    page_route = "/admin/clients"

    model = Client
    scalar_fields = ("name", "description")
    # No ``is_active`` column on purpose: a client is archived and restored through
    # its own action, so an import can neither archive nor reactivate one.

    def get_fields(self) -> List[ImportField]:
        return [
            ImportField(
                key="code",
                label="Code",
                required=True,
                field_type="string",
                help_text="Unique client code. Used to match existing clients.",
            ),
            ImportField(key="name", label="Name", required=True, field_type="string"),
            ImportField(
                key="description", label="Description", required=False, field_type="string"
            ),
        ]

    def get_alias_suggestions(self) -> Dict[str, List[str]]:
        return {
            "code": ["code", "client code", "client_code", "id", "short code"],
            "name": ["name", "client", "client name", "client_name", "customer"],
            "description": ["description", "notes", "details"],
        }

    def validate_new(self, values: Dict[str, Any]) -> Optional[str]:
        """``Client.name`` is unique too — report a clash readably."""
        name = values.get("name")
        if name and Client.objects.filter(name=name).exists():
            return f'A different client already uses the name "{name}".'
        return None

    def get_sample_rows(self) -> List[Dict[str, Any]]:
        return [
            {
                "code": "ACME",
                "name": "Acme Manufacturing",
                "description": "Primary manufacturing account",
            },
            {
                "code": "GLOBEX",
                "name": "Globex Retail",
                "description": "Retail support contract",
            },
        ]
