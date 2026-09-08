"""
Application-wide constants for the Engineering Tracker.

This module centralizes all hardcoded values to improve maintainability,
reduce typos, and enable easy refactoring.
"""

# Request/Log Status Constants
class RequestStatus:
    """Status choices for OT, Standby, and Leave requests."""
    PENDING = 'pending'
    APPROVED = 'approved'
    REJECTED = 'rejected'
    
    CHOICES = [
        (PENDING, 'Pending'),
        (APPROVED, 'Approved'),
        (REJECTED, 'Rejected'),
    ]


class LeaveRequestType:
    """Types of leave requests."""
    VACATION = 'vacation'
    SICK = 'sick'
    UNPAID = 'unpaid'
    
    CHOICES = [
        (VACATION, 'Vacation'),
        (SICK, 'Sick Leave'),
        (UNPAID, 'Unpaid Leave'),
    ]


# Permission Module Constants
class PermissionModule:
    """Permission module identifiers."""
    OVERTIME = 'overtime'
    STANDBY = 'standby'
    LEAVE = 'leave'
    DASHBOARD = 'dashboard'
    REPORTS = 'reports'
    USERS = 'users'
    PERMISSIONS = 'permissions'


# Permission Action Constants
class PermissionAction:
    """Permission action identifiers."""
    VIEW = 'view'
    CREATE = 'create'
    EDIT = 'edit'
    DELETE = 'delete'
    APPROVE = 'approve'
    EXPORT = 'export'


# Cache Key Prefixes
class CachePrefix:
    """Cache key prefixes for organized cache invalidation."""
    PERMISSION = 'perm'
    USER = 'user'
    DASHBOARD = 'dashboard'
    REPORT = 'report'
    CALENDAR = 'calendar'
    TEAM = 'team'


# Default Cache Timeouts (in seconds)
class CacheTimeout:
    """Default cache timeout values."""
    SHORT = 5 * 60  # 5 minutes
    MEDIUM = 30 * 60  # 30 minutes
    LONG = 60 * 60  # 1 hour
    VERY_LONG = 24 * 60 * 60  # 24 hours


# Event Type Constants
class EventType:
    """Calendar event types."""
    OVERTIME = 'overtime'
    STANDBY = 'standby'
    VACATION = 'vacation'
    SICK = 'sick'
    HOLIDAY = 'holiday'
    CUSTOM = 'custom'
