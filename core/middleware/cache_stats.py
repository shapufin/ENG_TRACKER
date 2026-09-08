"""
Cache statistics middleware for monitoring cache performance.

Tracks cache hit/miss rates and logs metrics for visibility
into cache effectiveness across the application.
"""

import logging
import time
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class CacheStatsMiddleware(MiddlewareMixin):
    """Middleware to track cache statistics and performance metrics."""
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.cache_hits = 0
        self.cache_misses = 0
        self.request_count = 0
        super().__init__(get_response)
    
    def process_request(self, request):
        """Track request start time for performance measurement."""
        request._cache_start_time = time.time()
        return None
    
    def process_response(self, request, response):
        """Log cache statistics after request processing."""
        try:
            # Calculate request duration
            if hasattr(request, '_cache_start_time'):
                duration = time.time() - request._cache_start_time
                
                # Log metrics periodically (every 100 requests)
                self.request_count += 1
                if self.request_count % 100 == 0:
                    hit_rate = (
                        (self.cache_hits / (self.cache_hits + self.cache_misses) * 100)
                        if (self.cache_hits + self.cache_misses) > 0
                        else 0
                    )
                    
                    logger.info(
                        f'Cache Stats: Hits={self.cache_hits}, '
                        f'Misses={self.cache_misses}, '
                        f'Hit Rate={hit_rate:.1f}%, '
                        f'Avg Response Time={duration*1000:.1f}ms'
                    )
        except Exception as e:
            logger.error(f'Error in cache stats middleware: {str(e)}')
        
        return response
