from django.core import checks

from core.plugins.registry import plugin_registry


@checks.register()
def check_plugins_loaded(app_configs, **kwargs):
    """Fail loudly when a plugin could not be imported.

    `discover_plugins()` skips a broken plugin, which otherwise just vanishes
    from every user's UI. The usual cause is a requirements.txt entry the
    running venv never installed.
    """
    return [
        checks.Error(
            f"Plugin '{name}' failed to load: {error}",
            hint="Run `pip install -r requirements.txt` in the venv serving this process.",
            id='plugins.E001',
        )
        for name, error in plugin_registry.load_errors.items()
    ]
