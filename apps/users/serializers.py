"""
Users app serializers.

This module contains DRF serializers for User, UserProfile, and Team models.
"""

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.models import User
from apps.overtime.serializers import ClientSerializer
from core.mixins.permissions import is_cr_admin
from .models import Tech, Team, UserProfile, TeamMembership


class ApprovalPeriodSerializer(serializers.Serializer):
    period = serializers.DateField(required=False)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Custom JWT token serializer that includes additional user data.

    Adds user profile information and roles to the token claims.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims
        token['username'] = user.username
        token['email'] = user.email
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name

        # Add profile data if available
        profile = getattr(user, 'profile', None)
        if profile is not None:
            token['albanian_tl_id'] = getattr(profile, 'albanian_tl_id', None)
            token['italian_tl_id'] = getattr(profile, 'italian_tl_id', None)
            token['is_italian_tl_role'] = bool(getattr(profile, 'is_italian_tl', False))
            token['is_albanian_tl_role'] = bool(getattr(profile, 'is_albanian_tl', False))
            # Computed property — required so clients that decode JWT claims
            # (or fall back to token payload) see TL authority from led_teams /
            # FK assignments, not only explicit role flags.
            token['is_team_leader'] = bool(getattr(profile, 'is_team_leader', False))
            token['is_hr'] = bool(getattr(profile, 'is_hr', False))
            hire_date = getattr(profile, 'hire_date', None)
            token['hire_date'] = str(hire_date) if hire_date else None
            # Use primary team property safely
            primary_team = getattr(profile, 'team', None)
            if primary_team is not None:
                token['team_id'] = primary_team.id
                token['team_name'] = primary_team.name
                token['team_code'] = primary_team.code
                token['calendar_group'] = primary_team.calendar_group
            # Include all teams (M2M) – prefetch if possible, else single query.
            token['teams'] = [
                {'id': t.id, 'name': t.name, 'code': t.code, 'calendar_group': t.calendar_group}
                for t in profile.teams.all()
            ]
            token['techs'] = [
                {'id': t.id, 'name': t.name, 'code': t.code}
                for t in profile.techs.filter(is_active=True).order_by('name')
            ]
            token['client_ids'] = list(profile.clients.values_list('id', flat=True))

        # Database role codes are the future capability authority.
        token['roles'] = sorted(
            getattr(getattr(user, 'profile', None), 'role_codes', []) or []
        )

        # CR admin role (scoped admin — not is_staff)
        token['is_cr_admin'] = is_cr_admin(user)

        # CR user flag (non-admin with active ControlRoomAccess). Lazy
        # import avoids a module-level plugin dependency. Used by the
        # frontend to hide standard employee nav and redirect to the CR
        # dashboard. See CONTEXT.md rule 11.
        token['has_control_room_access'] = cls._has_cr_access(user)

        return token

    @staticmethod
    def _has_cr_access(user) -> bool:
        """True if the user has an active ControlRoomAccess record."""
        try:
            from plugins.control_room.services.scope_service import get_access_for_user
            return bool(get_access_for_user(user))
        except Exception:
            return False

    def validate(self, attrs):
        data = super().validate(attrs)

        # Add user data to response
        user = self.user
        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
        }

        # Add profile data if available
        profile = getattr(user, 'profile', None)
        if profile is not None:
            data['user']['albanian_tl_id'] = getattr(profile, 'albanian_tl_id', None)
            data['user']['italian_tl_id'] = getattr(profile, 'italian_tl_id', None)
            data['user']['is_italian_tl_role'] = bool(getattr(profile, 'is_italian_tl', False))
            data['user']['is_albanian_tl_role'] = bool(getattr(profile, 'is_albanian_tl', False))
            data['user']['is_team_leader'] = getattr(profile, 'is_team_leader', False)
            data['user']['is_hr'] = getattr(profile, 'is_hr', False)
            hire_date = getattr(profile, 'hire_date', None)
            data['user']['hire_date'] = str(hire_date) if hire_date else None
            primary_team = getattr(profile, 'team', None)
            if primary_team is not None:
                data['user']['team'] = {
                    'id': primary_team.id,
                    'name': primary_team.name,
                    'code': primary_team.code,
                    'calendar_group': primary_team.calendar_group,
                }
            # Include all teams (M2M)
            data['user']['teams'] = [
                {'id': t.id, 'name': t.name, 'code': t.code, 'calendar_group': t.calendar_group}
                for t in profile.teams.all()
            ]
            data['user']['techs'] = [
                {'id': t.id, 'name': t.name, 'code': t.code}
                for t in profile.techs.filter(is_active=True).order_by('name')
            ]
            data['user']['client_ids'] = list(profile.clients.values_list('id', flat=True))

        data['user']['roles'] = sorted(
            getattr(getattr(user, 'profile', None), 'role_codes', []) or []
        )

        # CR admin role (scoped admin — not is_staff)
        data['user']['is_cr_admin'] = is_cr_admin(user)

        # CR user flag (non-admin with active ControlRoomAccess). Used
        # by the frontend to hide standard employee nav and redirect to
        # the CR dashboard. See CONTEXT.md rule 11.
        data['user']['has_control_room_access'] = self._has_cr_access(user)

        return data


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for Django's built-in User model.

    Provides basic user information without sensitive fields.
    """
    full_name = serializers.SerializerMethodField()
    is_italian_tl_role = serializers.SerializerMethodField()
    is_albanian_tl_role = serializers.SerializerMethodField()
    is_team_leader = serializers.SerializerMethodField()
    is_hr = serializers.SerializerMethodField()
    is_cr_admin = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    has_control_room_access = serializers.SerializerMethodField()
    team = serializers.SerializerMethodField()
    teams = serializers.SerializerMethodField()
    techs = serializers.SerializerMethodField()
    client_ids = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'is_staff', 'is_superuser', 'is_italian_tl_role', 'is_albanian_tl_role',
            'is_team_leader', 'is_hr', 'is_cr_admin', 'roles', 'has_control_room_access',
            'team', 'teams', 'techs', 'client_ids',
        ]
        read_only_fields = ['id']

    def get_full_name(self, obj) -> str:
        """Return user's full name."""
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username

    def get_is_italian_tl_role(self, obj) -> bool:
        """Check if user has the Italian TL role or assigned Italian reports."""
        roles = getattr(getattr(obj, 'profile', None), 'role_codes', []) or []
        if 'italian_tl' in roles:
            return True
        if hasattr(obj, 'profile') and obj.profile.is_italian_tl_role:
            return True
        return obj.italian_team_members.exists()

    def get_is_albanian_tl_role(self, obj) -> bool:
        """Check if user has the Albanian TL role or assigned Albanian reports."""
        roles = getattr(getattr(obj, 'profile', None), 'role_codes', []) or []
        if 'albanian_tl' in roles:
            return True
        if hasattr(obj, 'profile') and obj.profile.is_albanian_tl_role:
            return True
        return obj.albanian_team_members.exists()

    def get_is_team_leader(self, obj) -> bool:
        """Check if user is any kind of TL (database role or legacy flag)."""
        roles = getattr(getattr(obj, 'profile', None), 'role_codes', []) or []
        if 'italian_tl' in roles or 'albanian_tl' in roles:
            return True
        if hasattr(obj, 'profile'):
            return obj.profile.is_team_leader
        return obj.italian_team_members.exists() or obj.albanian_team_members.exists()

    def get_is_hr(self, obj) -> bool:
        """Check if user has the HR role, with the legacy flag as fallback."""
        roles = getattr(getattr(obj, 'profile', None), 'role_codes', []) or []
        if 'hr' in roles:
            return True
        if hasattr(obj, 'profile'):
            return obj.profile.is_hr_user
        return False

    def get_is_cr_admin(self, obj) -> bool:
        """Check if user has the active cr_admin role (scoped CR admin)."""
        return is_cr_admin(obj)

    def get_roles(self, obj) -> list[str]:
        """Return active database role codes for the user."""
        return sorted(getattr(getattr(obj, 'profile', None), 'role_codes', []) or [])

    def get_has_control_room_access(self, obj) -> bool:
        """True if the user has an active ControlRoomAccess record.

        Used by the frontend to detect CR users (non-admin employees with
        ControlRoomAccess) and hide standard employee nav, redirecting
        them to /control-room/dashboard. Uses the prefetched
        ``control_room_access`` related object when available to avoid
        an N+1 query in list endpoints. See CONTEXT.md rule 11.
        """
        # Use prefetched OneToOne related objects if present (no extra query).
        if hasattr(obj, '_prefetched_objects_cache') and 'control_room_access' in obj._prefetched_objects_cache:
            accesses = obj._prefetched_objects_cache['control_room_access']
            return any(getattr(a, 'is_active', False) for a in accesses)
        # Fallback: fresh query via scope_service. Never use the cached reverse
        # OneToOne accessor (``getattr(obj, 'control_room_access')``) — Django
        # populates that cache when the related object is created/saved, so it
        # can return a stale ``is_active`` value after the record is updated
        # elsewhere. ``get_access_for_user`` filters ``is_active=True`` and
        # always hits the DB, so it reflects the current state.
        try:
            from plugins.control_room.services.scope_service import get_access_for_user
            return bool(get_access_for_user(obj))
        except Exception:
            return False

    def get_team(self, obj) -> dict | None:
        """Get user's primary team (backward compatibility)."""
        if hasattr(obj, 'profile'):
            team = obj.profile.get_primary_team()
            if team:
                return {
                    'id': team.id,
                    'name': team.name,
                    'code': team.code,
                    'calendar_group': team.calendar_group,
                }
        return None

    def get_teams(self, obj) -> list:
        """Get all user's teams (M2M)."""
        if hasattr(obj, 'profile'):
            return [
                {
                    'id': team.id,
                    'name': team.name,
                    'code': team.code,
                    'calendar_group': team.calendar_group,
                }
                for team in obj.profile.teams.all()
            ]
        return []

    def get_techs(self, obj) -> list:
        """Get active Tech assignments for the user."""
        if hasattr(obj, 'profile'):
            profile = obj.profile
            techs = [tech for tech in profile.techs.all() if tech.is_active]
            return [
                {'id': tech.id, 'name': tech.name, 'code': tech.code}
                for tech in sorted(techs, key=lambda tech: tech.name)
            ]
        return []

    def get_client_ids(self, obj) -> list:
        """Get IDs of clients assigned to this user.

        Uses prefetched ``profile__clients`` when available to avoid N+1
        queries in list endpoints.
        """
        if hasattr(obj, 'profile'):
            profile = obj.profile
            # Use prefetched cache if present (no extra query)
            if hasattr(profile, '_prefetched_objects_cache') and 'clients' in profile._prefetched_objects_cache:
                return [c.id for c in profile.clients.all()]
            return list(profile.clients.values_list('id', flat=True))
        return []


class TechSerializer(serializers.ModelSerializer):
    """Serializer for the independent user technology catalog."""

    class Meta:
        model = Tech
        fields = ['id', 'name', 'code', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class TeamSerializer(serializers.ModelSerializer):
    """
    Serializer for Team model.

    Includes team leader information and parent team reference.
    """
    team_leader = UserSerializer(read_only=True)
    team_leader_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source='team_leader',
        write_only=True,
        required=False,
        allow_null=True
    )
    parent_team = serializers.PrimaryKeyRelatedField(read_only=True)
    parent_team_name = serializers.CharField(source='parent_team.name', read_only=True)
    parent_team_id = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        source='parent_team',
        write_only=True,
        required=False,
        allow_null=True
    )
    sub_teams_count = serializers.SerializerMethodField()
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            'id', 'name', 'code', 'description', 'calendar_group',
            'parent_team', 'parent_team_id', 'parent_team_name',
            'team_leader', 'team_leader_id',
            'sub_teams_count', 'members_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_sub_teams_count(self, obj) -> int:
        """Count of direct sub-teams."""
        annotated = getattr(obj, 'sub_teams_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.sub_teams.count()

    def get_members_count(self, obj) -> int:
        """Count of team members."""
        annotated = getattr(obj, 'members_count_annotated', None)
        if annotated is not None:
            return annotated
        return obj.members.count()


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Serializer for UserProfile model.

    Includes nested user data and team information.
    """
    user = UserSerializer(read_only=True)
    team = serializers.SerializerMethodField()
    team_name = serializers.SerializerMethodField()
    team_code = serializers.SerializerMethodField()
    teams = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Team.objects.all(),
        required=False,
        allow_null=True
    )
    teams_detail = TeamSerializer(source='teams', many=True, read_only=True)
    techs = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Tech.objects.all(),
        required=False,
    )
    techs_detail = TechSerializer(source='techs', many=True, read_only=True)

    def validate_techs(self, techs):
        """Allow inactive Techs only if already assigned to this user.

        Active Techs are always allowed. Inactive Techs are allowed only
        if the user already has them assigned (so editing a user with
        inactive Techs doesn't fail). New inactive Tech assignments must
        go through the Tech member management dialog.
        """
        if not techs:
            return techs
        inactive = [t for t in techs if not t.is_active]
        if not inactive:
            return techs
        if self.instance:
            existing_ids = set(self.instance.techs.values_list('id', flat=True))
            for t in inactive:
                if t.id not in existing_ids:
                    raise serializers.ValidationError(
                        f"Cannot assign inactive Tech '{t.name}'. "
                        f"Use the Tech member management dialog instead."
                    )
        else:
            raise serializers.ValidationError(
                "Cannot assign inactive Techs to new users. "
                "Use the Tech member management dialog after creation."
            )
        return techs
    clients = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=ClientSerializer.Meta.model.objects.all(),
        required=False,
        allow_null=True
    )
    clients_detail = ClientSerializer(source='clients', many=True, read_only=True)
    albanian_tl_name = serializers.SerializerMethodField()
    italian_tl_name = serializers.SerializerMethodField()
    groups = serializers.SerializerMethodField()
    current_month_overtime_hours = serializers.DecimalField(max_digits=7, decimal_places=2, read_only=True)
    current_month_standby_hours = serializers.DecimalField(max_digits=7, decimal_places=2, read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'team', 'team_name', 'team_code', 'teams', 'teams_detail',
            'techs', 'techs_detail',
            'clients', 'clients_detail',
            'albanian_tl', 'albanian_tl_name', 'italian_tl', 'italian_tl_name',
            'is_hr_user', 'is_italian_tl_role', 'is_albanian_tl_role', 'phone', 'hire_date', 'groups',
            'current_month_overtime_hours', 'current_month_standby_hours',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_team(self, obj) -> dict | None:
        """Safely get primary team info for backward compatibility."""
        team = obj.team
        if team:
            return {
                'id': team.id,
                'name': team.name,
                'code': team.code,
                'calendar_group': team.calendar_group,
            }
        return None

    def get_team_name(self, obj) -> str | None:
        """Safely get primary team name."""
        team = obj.team
        return team.name if team else None

    def get_team_code(self, obj) -> str | None:
        """Safely get primary team code."""
        team = obj.team
        return team.code if team else None

    def get_albanian_tl_name(self, obj) -> str | None:
        """Safely get Albanian TL name."""
        if obj.albanian_tl:
            return obj.albanian_tl.get_full_name()
        return None

    def get_italian_tl_name(self, obj) -> str | None:
        """Safely get Italian TL name."""
        if obj.italian_tl:
            return obj.italian_tl.get_full_name()
        return None

    def get_groups(self, obj) -> list:
        """Return a list of group names for the user."""
        try:
            user = obj.user
            # Use cached prefetch if available; .all() hits the prefetch cache.
            return [ug.group.name for ug in user.user_groups.all()]
        except Exception:
            return []


class TeamHierarchySerializer(serializers.ModelSerializer):
    """
    Serializer for team hierarchy display.

    Includes recursive sub-teams.
    """
    sub_teams = serializers.SerializerMethodField()
    members = UserProfileSerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = [
            'id', 'name', 'code', 'description',
            'team_leader', 'members', 'sub_teams'
        ]

    def get_sub_teams(self, obj) -> list:
        """Recursively serialize sub-teams."""
        sub_teams = obj.sub_teams.all()
        return TeamHierarchySerializer(sub_teams, many=True).data


class TeamMembershipSerializer(serializers.ModelSerializer):
    """
    Serializer for TeamMembership through model.
    """
    team_name = serializers.CharField(source='team.name', read_only=True)
    team_code = serializers.CharField(source='team.code', read_only=True)
    user_username = serializers.CharField(source='user_profile.user.username', read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            'id', 'user_profile', 'team', 'team_name', 'team_code',
            'user_username', 'joined_date', 'is_primary_team',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
