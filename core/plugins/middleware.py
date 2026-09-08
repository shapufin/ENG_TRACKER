"""
Middleware to handle missing plugin tables gracefully.
Prevents 500 errors when plugin tables don't exist.
"""

import logging
from django.http import JsonResponse
from django.db import OperationalError
from django.db.utils import ProgrammingError

logger = logging.getLogger(__name__)


class PluginTableErrorMiddleware:
    """
    Catches OperationalError from missing plugin tables and returns graceful error.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except (OperationalError, ProgrammingError) as e:
            error_msg = str(e)
            
            # Check if it's a missing table error
            if 'no such table' in error_msg or 'does not exist' in error_msg:
                logger.warning(f"Plugin table missing: {error_msg}")
                
                # Extract plugin name from table name if possible
                # e.g., "no such table: plugins_budget_budget"
                if 'plugins_' in error_msg:
                    parts = error_msg.split('plugins_')
                    if len(parts) > 1:
                        table_part = parts[1].split()[0]
                        plugin_name = table_part.split('_')[0]
                        
                        # Try to initialize the plugin
                        try:
                            from core.plugins.initializer import PluginTableManager
                            PluginTableManager.ensure_plugin_tables(plugin_name)
                            logger.info(f"Initialized plugin {plugin_name} on demand")
                            
                            # Retry the request
                            return self.get_response(request)
                        except Exception as init_error:
                            logger.error(f"Failed to initialize plugin {plugin_name}: {init_error}")
                
                # Return graceful error response
                if request.path.startswith('/api/'):
                    return JsonResponse({
                        'error': 'Plugin tables not initialized',
                        'detail': 'Run "python manage.py ensure_plugins" to initialize plugins',
                        'status': 503
                    }, status=503)
                else:
                    return JsonResponse({
                        'error': 'Service temporarily unavailable',
                        'detail': 'Plugin initialization required',
                        'status': 503
                    }, status=503)
            
            # Re-raise if not a plugin table error
            raise
