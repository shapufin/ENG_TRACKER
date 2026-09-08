import logging

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.plugins.viewsets import PluginViewSet
from core.plugins.registry import plugin_registry

router = DefaultRouter()
router.register(r'management', PluginViewSet, basename='plugin-management')

urlpatterns = [
    path('', include(router.urls)),
]

logger = logging.getLogger(__name__)

try:
    # We use get_all_plugins() instead of get_active_plugins() here
    # to avoid database access during URL loading if possible,
    # OR we handle the database access carefully.
    # Actually, get_active_plugins() is better if we want to hide inactive plugin URLs.
    active_plugins = plugin_registry.get_active_plugins()
    for plugin_name, plugin_instance in active_plugins.items():
        try:
            plugin_urls = plugin_instance.get_urls()
            if plugin_urls:
                urlpatterns.append(path(f'{plugin_name}/', include(plugin_urls)))
                logger.info(f"Registered URLs for plugin: {plugin_name}")
        except Exception as e:
            logger.error(f"Failed to register URLs for plugin {plugin_name}: {e}")
except Exception as e:
    # Fail gracefully during migrations or when DB is not ready
    logger.warning(f"Could not load dynamic plugin URLs: {e}")

