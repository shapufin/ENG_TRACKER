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

# Every discovered plugin is mounted, enabled or not. Reading the enabled set
# from the database here meant a plugin enabled after boot stayed 404 until a
# restart, and an unreachable database at boot dropped every plugin route.
# Whether a plugin answers is decided per request by ``PluginEnabledMixin``
# (``core/mixins/permissions.py``), which fails closed with a 403.
for plugin_name, plugin_instance in plugin_registry.get_all_plugins().items():
    try:
        plugin_urls = plugin_instance.get_urls()
        if plugin_urls:
            urlpatterns.append(path(f'{plugin_name}/', include(plugin_urls)))
            logger.info(f"Registered URLs for plugin: {plugin_name}")
    except Exception as e:
        logger.error(f"Failed to register URLs for plugin {plugin_name}: {e}")
