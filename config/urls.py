"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse, Http404
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
from apps.users.views.auth import CustomTokenObtainPairView, CustomTokenRefreshView, TokenLogoutView


class GatedSpectacularAPIView(SpectacularAPIView):
    """Schema endpoint that 404s when API docs are disabled.

    ``ENABLE_API_DOCS`` defaults to ``True`` (dev). In production it is
    set to ``False`` so unauthenticated users cannot enumerate every
    endpoint, parameter, and serializer field (P0-4). The check runs at
    request time (not URL-conf time) so ``override_settings`` works in
    tests.
    """

    def get(self, request, *args, **kwargs):
        if not getattr(settings, "ENABLE_API_DOCS", True) and not settings.DEBUG:
            raise Http404("API schema is not available.")
        return super().get(request, *args, **kwargs)


def _health_live(_request):
    """Liveness probe — process is up. No auth, no DB hit."""
    return JsonResponse({"status": "live"})


def _health_ready(request):
    """Readiness probe — DB + cache reachable.

    Unauthenticated by design so orchestrators (k8s, load balancers) can
    poll it. Returns 503 if any dependency fails so traffic is not routed
    to an unhealthy instance.

    P2-2: Does not leak which dependency failed — only returns
    ``{"status": "ready"}`` or ``{"status": "degraded"}``.
    P2-11: Throttled to prevent DoS via repeated DB/cache probes.
    """
    from django.db import connections, DatabaseError
    from django.core.cache import cache

    # P2-11: simple IP-based throttle for the readiness endpoint.
    # Orchestrators poll every 10-30s; 60/min is generous. This prevents
    # an external attacker from hammering the endpoint and forcing
    # repeated DB/cache round-trips.
    client_ip = (
        request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[-1].strip()
        or request.META.get('REMOTE_ADDR', 'unknown')
    )
    throttle_key = f'health_throttle:{client_ip}'
    request_count = cache.get(throttle_key, 0)
    if request_count >= 60:
        return JsonResponse(
            {"status": "degraded"},
            status=429,
        )
    cache.set(throttle_key, request_count + 1, timeout=60)

    healthy = True

    try:
        connections["default"].cursor().execute("SELECT 1")
    except (DatabaseError, Exception):  # noqa: BLE001
        healthy = False

    if healthy:
        try:
            cache.set("_health_probe", "1", timeout=10)
            if cache.get("_health_probe") != "1":
                healthy = False
        except Exception:  # noqa: BLE001
            healthy = False

    # P2-2: no detail leak — just status
    return JsonResponse(
        {"status": "ready" if healthy else "degraded"},
        status=200 if healthy else 503,
    )


urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),

    # Health/readiness probes (no auth — for orchestrators)
    path('api/health/live/', _health_live, name='health-live'),
    path('api/health/ready/', _health_ready, name='health-ready'),
]

# API Documentation — the schema endpoint is always registered but
# gated at request time by GatedSpectacularAPIView (404 when
# ENABLE_API_DOCS=False and not DEBUG). The docs UI (Swagger/Redoc) is
# only registered when docs are enabled, since it has no server-side
# gating and is purely a static UI.
if getattr(settings, "ENABLE_API_DOCS", True) or settings.DEBUG:
    urlpatterns += [
        path('api/schema/', GatedSpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
        path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
else:
    # Schema endpoint registered even when docs are off, but the view
    # returns 404. This allows override_settings(ENABLE_API_DOCS=True)
    # to work in tests without reloading URLconf.
    urlpatterns += [
        path('api/schema/', GatedSpectacularAPIView.as_view(), name='schema'),
    ]

urlpatterns += [
    # App APIs
    path('api/users/', include('apps.users.urls')),
    path('api/overtime/', include('apps.overtime.urls')),
    path('api/standby/', include('apps.standby.urls')),
    path('api/leave-management/', include('apps.leave_management.urls')),
    path('api/permissions/', include('apps.permissions.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/dashboard/', include('apps.dashboard.urls')),
    path('api/plugins/', include('apps.plugins.urls')),

    # Auth API (JWT endpoints)
    path('api/auth/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/token/logout/', TokenLogoutView.as_view(), name='token_logout'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif getattr(settings, 'SERVE_MEDIA_IN_PROD', False):
    # P0-6: In production, media is served by nginx -> backend proxy.
    # The backend uses a hardened ``protected_media`` view that forces
    # ``Content-Disposition: attachment`` + ``nosniff`` and blocks path
    # traversal. For CDN/S3 deployments, leave this False and configure
    # django-storages instead.
    from .views import protected_media
    urlpatterns += [
        path('media/<path:path>', protected_media, name='protected_media'),
    ]
