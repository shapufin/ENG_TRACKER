"""Registered capability policy and protected capability guards."""

# These capabilities remain code-protected even if a database role is edited.
PROTECTED_CAPABILITIES = frozenset({
    "users:manage",
    "users:grant_roles",
    "system:configure",
    "audit_log:delete",
})


def capability_key(module: str, action: str) -> str:
    """Build the stable external capability identifier."""
    return f"{module}:{action}"


def is_protected(module: str, action: str) -> bool:
    """Return whether a capability requires a superuser policy guard."""
    return capability_key(module, action) in PROTECTED_CAPABILITIES
