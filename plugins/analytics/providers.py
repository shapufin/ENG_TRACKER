from abc import ABC, abstractmethod
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class AnalyticsProvider(ABC):
    """
    Abstract base class for analytics providers.
    Other plugins can implement this to contribute metrics to the analytics dashboard.
    """
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Unique identifier for the provider."""
        pass

    @abstractmethod
    def get_metrics(self, period: str = 'month', **kwargs) -> List[Dict[str, Any]]:
        """
        Return a list of metrics provided by this plugin.
        Each metric should follow the standard format:
        {
            'name': str,
            'value': float,
            'change': float,
            'trend': 'up' | 'down' | 'stable',
            'metadata': dict
        }
        """
        pass

    @abstractmethod
    def get_charts(self, period: str = 'month', **kwargs) -> List[Dict[str, Any]]:
        """
        Return chart data provided by this plugin.
        """
        pass

class AnalyticsRegistry:
    """
    Registry for analytics providers.
    """
    _providers: Dict[str, AnalyticsProvider] = {}

    @classmethod
    def register(cls, provider: AnalyticsProvider):
        cls._providers[provider.provider_name] = provider
        logger.info(f"Registered analytics provider: {provider.provider_name}")

    @classmethod
    def unregister(cls, provider_name: str):
        if provider_name in cls._providers:
            del cls._providers[provider_name]
            logger.info(f"Unregistered analytics provider: {provider_name}")

    @classmethod
    def get_all_providers(cls) -> Dict[str, AnalyticsProvider]:
        return cls._providers

    @classmethod
    def get_provider(cls, name: str) -> AnalyticsProvider:
        return cls._providers.get(name)

# Global registry instance
analytics_registry = AnalyticsRegistry()
