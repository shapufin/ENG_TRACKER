"""Synchronize plugin permission manifests with database configuration."""

from django.db import transaction

from apps.permissions.models import Role
from apps.plugins.models import PluginPermission

SUPPORTED_ACTIONS = frozenset(action for action, _ in PluginPermission.ACTION_CHOICES)


def validate_manifest(manifest: dict) -> None:
    """Validate action names and stable role codes before writing anything."""
    unknown_actions = set(manifest) - SUPPORTED_ACTIONS
    if unknown_actions:
        raise ValueError(f"Unsupported plugin action(s): {', '.join(sorted(unknown_actions))}")

    role_codes = {
        code
        for settings in manifest.values()
        for code in settings.get("roles", [])
    }
    existing_codes = set(Role.objects.filter(code__in=role_codes).values_list("code", flat=True))
    unknown_roles = role_codes - existing_codes
    if unknown_roles:
        raise ValueError(f"Unknown plugin role code(s): {', '.join(sorted(unknown_roles))}")

    for action, settings in manifest.items():
        if not isinstance(settings, dict):
            raise ValueError(f"Permission manifest for {action} must be an object")
        roles = settings.get("roles", [])
        if not isinstance(roles, list) or not all(isinstance(code, str) for code in roles):
            raise ValueError(f"Permission manifest roles for {action} must be a list of codes")
        if not isinstance(settings.get("public", False), bool):
            raise ValueError(f"Permission manifest public flag for {action} must be boolean")


def sync_plugin_permission_manifest(plugin, *, reset=False) -> dict[str, int]:
    """Create or explicitly reset a plugin's permission rows from its manifest.

    Existing rows are preserved by default so administrator customizations are
    not silently overwritten. New rows receive explicit deny unless the
    manifest grants public or role access.
    """
    manifest = plugin.get_permission_manifest()
    validate_manifest(manifest)
    role_ids = {
        role.code: role.id
        for role in Role.objects.filter(
            code__in={code for settings in manifest.values() for code in settings.get("roles", [])}
        )
    }
    created = 0
    updated = 0
    with transaction.atomic():
        for action in SUPPORTED_ACTIONS:
            settings = manifest.get(action, {"roles": [], "public": False})
            permission, was_created = PluginPermission.objects.get_or_create(
                plugin_name=plugin.name,
                action=action,
                defaults={"is_public": settings.get("public", False)},
            )
            if was_created:
                permission.allowed_roles.set(
                    [role_ids[code] for code in settings.get("roles", [])]
                )
                created += 1
            elif reset:
                permission.is_public = settings.get("public", False)
                permission.save(update_fields=["is_public"])
                permission.allowed_roles.set(
                    [role_ids[code] for code in settings.get("roles", [])]
                )
                updated += 1
    return {"created": created, "updated": updated}
