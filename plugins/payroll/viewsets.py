"""ViewSets for the Payroll plugin.

All endpoints require authentication. Plugin permission actions:
- ``view``: read access (list, retrieve)
- ``manage``: wage CRUD, run create/generate/finalize/cancel
- ``configure``: configuration, rule sets, work calendar
- ``export``: Excel/PDF export

Admin-only initially (no roles in the manifest). Staff/superuser
bypass is handled by ``PluginPermissionMixin``.
"""
import logging
from datetime import date, datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Exists,
    OuterRef,
    Q,
    Value,
    When,
)
from django.utils import timezone
from django.http import FileResponse
from rest_framework import viewsets, status, permissions, filters
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from core.mixins.permissions import PluginPermissionMixin

from .models import (
    PayrollConfiguration,
    PayrollContributionRate,
    PayrollOvertimeCategory,
    PayrollRuleSet,
    PayrollTaxBracket,
    PayrollRun,
    PayrollWorkCalendar,
    PayrollWorkday,
    WageAssignment,
)
from .serializers import (
    PayrollConfigurationSerializer,
    PayrollLineSerializer,
    PayrollRuleSetAtomicSaveSerializer,
    PayrollRuleSetCloneSerializer,
    PayrollRuleSetCreateSerializer,
    PayrollRuleSetSerializer,
    PayrollTaxBracketSerializer,
    PayrollContributionRateSerializer,
    PayrollOvertimeCategorySerializer,
    PayrollRunCreateSerializer,
    PayrollRunGenerateSerializer,
    PayrollRunSerializer,
    PayrollWorkCalendarSerializer,
    PayrollWorkdaySerializer,
    WageAssignmentCreateSerializer,
    WageAssignmentSerializer,
)
from .services.payroll_service import (
    build_calculation_input,
    cancel_run,
    finalize_run,
    generate_draft_run,
    get_period_closure_status,
)
from .services.calculator import calculate_payroll

logger = logging.getLogger(__name__)
User = get_user_model()


def _allowed_payroll_user_ids(user):
    """Return the salary-data scope for a future non-admin permission grant."""
    if user.is_staff or user.is_superuser:
        return None
    allowed = {user.id}
    profile = getattr(user, 'profile', None)
    if profile:
        allowed.update(profile.get_team_member_ids())
    return allowed


def _json_safe(value):
    """Convert audit payloads to values accepted by JSONField/JSONEncoder."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def _log_audit(user, action_label, description, new_values=None, old_values=None):
    """Best-effort audit log with JSON-safe values."""
    try:
        from plugins.audit_log.signals import log_action
        log_action(
            user=user,
            action=action_label,
            description=description,
            new_values=_json_safe(new_values or {}),
            old_values=_json_safe(old_values or {}),
            ip_address='',
            user_agent='',
        )
    except Exception:
        logger.warning('Payroll audit logging failed', exc_info=True)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class PayrollConfigurationViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    """Singleton configuration. Only one row (pk=1)."""
    plugin_name = 'payroll'
    queryset = PayrollConfiguration.objects.all()
    serializer_class = PayrollConfigurationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None
    permission_action_map = {
        'list': 'view', 'retrieve': 'view', 'choices': 'view',
        'create': 'configure', 'update': 'configure', 'partial_update': 'configure',
        'destroy': 'configure',
    }

    def list(self, request, *args, **kwargs):
        """Return the singleton configuration as an object, not a collection."""
        instance = PayrollConfiguration.get_singleton()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def get_object(self):
        return PayrollConfiguration.get_singleton()

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Payroll configuration cannot be deleted.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=['get'])
    def choices(self, request):
        """Return model choice fields for frontend dropdowns."""
        return Response({
            'currency': [{'value': v, 'label': str(lbl)} for v, lbl in PayrollConfiguration.CURRENCY_CHOICES],
            'country': [{'value': v, 'label': str(lbl)} for v, lbl in PayrollConfiguration.COUNTRY_CHOICES],
            'default_tax_profile': [
                {'value': v, 'label': str(lbl)} for v, lbl in PayrollRuleSet.TAX_PROFILE_CHOICES
            ],
            'rounding_mode': [{'value': v, 'label': str(lbl)} for v, lbl in PayrollConfiguration.ROUNDING_MODE_CHOICES],
            'monthly_hours_strategy': [{'value': v, 'label': str(lbl)} for v, lbl in PayrollConfiguration.MONTHLY_HOURS_STRATEGY_CHOICES],
            'missing_timestamp_fallback_category': [
                {'value': v, 'label': str(lbl)}
                for v, lbl in PayrollOvertimeCategory.CODE_CHOICES
            ],
        })

    def perform_update(self, serializer):
        actor = self.request.user
        instance = serializer.instance
        old_values = {
            'organization_name': instance.organization_name,
            'currency': instance.currency,
            'weekday_standby_hourly_rate': str(instance.weekday_standby_hourly_rate),
            'weekend_standby_hourly_rate': str(instance.weekend_standby_hourly_rate),
            'only_approved_entries': instance.only_approved_entries,
        }
        instance = serializer.save()
        _log_audit(actor, 'payroll_config_update',
                    'Updated payroll configuration',
                    new_values=serializer.validated_data,
                    old_values=old_values)


# ---------------------------------------------------------------------------
# Wages
# ---------------------------------------------------------------------------

class WageAssignmentViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'payroll'
    queryset = WageAssignment.objects.all().select_related(
        'user', 'user__profile', 'created_by', 'updated_by',
    )
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['user__username', 'user__email', 'user__first_name', 'user__last_name']
    filterset_fields = ['user', 'is_active', 'effective_from']
    permission_action_map = {
        'list': 'view', 'retrieve': 'view', 'history': 'view',
        'eligible_users': 'view',
        'create': 'manage', 'update': 'manage', 'partial_update': 'manage',
        'destroy': 'manage', 'bulk_create': 'manage',
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        allowed_ids = _allowed_payroll_user_ids(self.request.user)
        if allowed_ids is not None:
            queryset = queryset.filter(user_id__in=allowed_ids)
        return queryset

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return WageAssignmentCreateSerializer
        return WageAssignmentSerializer

    def perform_create(self, serializer):
        actor = self.request.user
        instance = serializer.save(created_by=actor, updated_by=actor)
        _log_audit(actor, 'payroll_wage_create',
                    f'Created wage for {instance.user.username}: {instance.gross_monthly_wage}',
                    new_values={'user_id': instance.user_id, 'wage': str(instance.gross_monthly_wage),
                                'effective_from': str(instance.effective_from)})

    def perform_update(self, serializer):
        actor = self.request.user
        old = serializer.instance
        old_values = {
            'wage': str(old.gross_monthly_wage),
            'effective_from': str(old.effective_from),
            'effective_to': str(old.effective_to) if old.effective_to else None,
            'is_active': old.is_active,
        }
        instance = serializer.save(updated_by=actor)
        _log_audit(actor, 'payroll_wage_update',
                    f'Updated wage for {instance.user.username}',
                    new_values={'wage': str(instance.gross_monthly_wage),
                                'effective_from': str(instance.effective_from),
                                'effective_to': str(instance.effective_to) if instance.effective_to else None,
                                'is_active': instance.is_active},
                    old_values=old_values)

    @action(detail=False, methods=['get'])
    def history(self, request):
        """Wage history grouped by user."""
        user_id = request.query_params.get('user_id')
        allowed_ids = _allowed_payroll_user_ids(request.user)
        if user_id and allowed_ids is not None:
            try:
                requested_user_id = int(user_id)
            except ValueError:
                raise PermissionDenied('Invalid user scope.')
            if requested_user_id not in allowed_ids:
                raise PermissionDenied('You cannot view this user\'s wage history.')
        qs = self.get_queryset()
        if user_id:
            qs = qs.filter(user_id=user_id)
        qs = qs.order_by('user__username', '-effective_from')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def eligible_users(self, request):
        """Return active users available for wage assignment."""
        allowed_ids = _allowed_payroll_user_ids(request.user)
        qs = User.objects.filter(is_active=True).order_by('username')
        if allowed_ids is not None:
            qs = qs.filter(id__in=allowed_ids)
        # Annotate with current active wage info
        active_wages = {
            wa.user_id: wa
            for wa in WageAssignment.objects.filter(is_active=True).select_related('user')
        }
        users_data = []
        for user in qs:
            wa = active_wages.get(user.id)
            full = f'{user.first_name} {user.last_name}'.strip() or user.username
            users_data.append({
                'id': user.id,
                'username': user.username,
                'full_name': full,
                'has_active_wage': wa is not None,
                'current_wage': str(wa.gross_monthly_wage) if wa else None,
            })
        return Response(users_data)

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple wage assignments at once (per-user wages)."""
        assignments = request.data.get('assignments', [])
        if not assignments or not isinstance(assignments, list):
            return Response(
                {'detail': 'assignments must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(assignments) > 100:
            return Response(
                {'detail': 'Maximum 100 wage assignments per bulk request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = request.user
        allowed_ids = _allowed_payroll_user_ids(actor)
        errors = []
        created = 0

        # Check for duplicate users in the request
        user_ids = [item.get('user') for item in assignments]
        if len(user_ids) != len(set(user_ids)):
            return Response(
                {'detail': 'Duplicate users in assignments list. Each user may only appear once.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate all entries first
        validated = []
        for idx, item in enumerate(assignments):
            serializer = WageAssignmentCreateSerializer(data=item)
            if not serializer.is_valid():
                errors.append({
                    'index': idx,
                    'errors': serializer.errors,
                })
                continue
            # Check user scope
            user_id = serializer.validated_data.get('user')
            if allowed_ids is not None and user_id.id not in allowed_ids:
                errors.append({
                    'index': idx,
                    'errors': {'user': 'You cannot manage this user\'s wages.'},
                })
                continue
            validated.append(serializer.validated_data)

        if errors:
            return Response(
                {'detail': 'Validation failed for some entries.', 'errors': errors},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # All valid — create atomically
        try:
            with transaction.atomic():
                for data in validated:
                    user = data['user']
                    WageAssignment.objects.create(
                        user=user,
                        gross_monthly_wage=data['gross_monthly_wage'],
                        effective_from=data['effective_from'],
                        effective_to=data.get('effective_to'),
                        note=data.get('note', ''),
                        is_active=data.get('is_active', True),
                        created_by=actor,
                        updated_by=actor,
                    )
                    created += 1
        except Exception as e:
            logger.error('Bulk wage create failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Bulk wage creation failed. No assignments were created.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(actor, 'payroll_wage_bulk_create',
                    f'Bulk created {created} wage assignments',
                    new_values={'count': created})
        return Response({'created': created, 'errors': []}, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Rule sets
# ---------------------------------------------------------------------------

def _validate_rule_children(rule_set):
    brackets = list(rule_set.tax_brackets.order_by('lower_bound', 'order', 'pk'))
    if not brackets:
        return
    if brackets[0].lower_bound != 0:
        raise ValidationError({'tax_brackets': 'Tax brackets must start at zero.'})
    open_ended = [bracket for bracket in brackets if bracket.upper_bound is None]
    if len(open_ended) != 1 or open_ended[0] != brackets[-1]:
        raise ValidationError({'tax_brackets': 'Exactly one open-ended bracket must be last.'})
    for previous, current in zip(brackets, brackets[1:]):
        if previous.upper_bound != current.lower_bound:
            raise ValidationError({'tax_brackets': 'Tax brackets must be ordered, contiguous, and gap-free.'})


class PayrollRuleSetViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'payroll'
    queryset = PayrollRuleSet.objects.none()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['name', 'code', 'source']
    filterset_fields = ['is_active', 'tax_profile', 'country']

    def get_queryset(self):
        """Annotate each rule set with `has_payroll_runs` and `effective_status`.

        `effective_status` mirrors `PayrollRuleSet.resolve_for_date` evaluated
        for today, so the UI can label the currently-effective rule set
        distinctly from superseded, upcoming, and inactive ones — even when
        multiple rows share ``is_active=True``. Tax profiles are evaluated
        independently. ``today`` is computed per request so the status stays
        correct as time advances without a process restart.
        """
        today = timezone.now().date()
        # A newer active rule set (same tax profile) that also covers today
        # would win in resolve_for_date, superseding this one.
        newer_covers_today = PayrollRuleSet.objects.filter(
            is_active=True,
            tax_profile=OuterRef('tax_profile'),
            effective_from__gt=OuterRef('effective_from'),
            effective_from__lte=today,
        ).filter(
            Q(effective_to__isnull=True) | Q(effective_to__gte=today),
        )
        covers_today = Q(is_active=True, effective_from__lte=today) & (
            Q(effective_to__isnull=True) | Q(effective_to__gte=today)
        )
        return (
            PayrollRuleSet.objects.annotate(
                has_payroll_runs=Exists(
                    PayrollRun.objects.filter(rule_set=OuterRef('pk'))
                ),
                is_currently_effective=Case(
                    When(
                        covers_today & ~Exists(newer_covers_today),
                        then=Value(True),
                    ),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                effective_status=Case(
                    When(is_active=False, then=Value('inactive')),
                    When(effective_from__gt=today, then=Value('upcoming')),
                    When(is_currently_effective=True, then=Value('current')),
                    default=Value('superseded'),
                    output_field=CharField(),
                ),
            ).prefetch_related(
                'tax_brackets', 'contribution_rates', 'overtime_categories',
            )
        )
    permission_action_map = {
        'list': 'view', 'retrieve': 'view', 'clone': 'configure', 'atomic_save': 'configure',
        'create': 'configure', 'update': 'configure', 'partial_update': 'configure',
        'destroy': 'configure', 'tax_brackets': 'configure', 'update_tax_bracket': 'configure',
        'delete_tax_bracket': 'configure', 'contributions': 'configure',
        'update_contribution': 'configure', 'delete_contribution': 'configure',
        'overtime_categories': 'configure', 'update_overtime_category': 'configure',
        'delete_overtime_category': 'configure',
    }

    def get_serializer_class(self):
        if self.action == 'atomic_save':
            return PayrollRuleSetAtomicSaveSerializer
        if self.action == 'clone':
            return PayrollRuleSetCloneSerializer
        if self.action in ('update_tax_bracket', 'tax_brackets'):
            return PayrollTaxBracketSerializer
        if self.action in ('update_contribution', 'contributions'):
            return PayrollContributionRateSerializer
        if self.action in ('update_overtime_category', 'overtime_categories'):
            return PayrollOvertimeCategorySerializer
        if self.action in ('create', 'update', 'partial_update'):
            return PayrollRuleSetCreateSerializer
        return PayrollRuleSetSerializer

    def _ensure_mutable(self, rule_set):
        if rule_set.runs.exists():
            raise ValidationError(
                'This rule set is referenced by a payroll run and is immutable. '
                'Create a new version instead.'
            )

    def _child_mutation(self, request, rule_set, model, serializer_class, child_id=None):
        self._ensure_mutable(rule_set)
        instance = model.objects.filter(rule_set=rule_set, pk=child_id).first() if child_id else None
        if child_id and instance is None:
            raise ValidationError({'detail': 'Child component does not belong to this rule set.'})
        serializer = serializer_class(
            instance, data=request.data, partial=bool(instance), context={'rule_set': rule_set},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            child = serializer.save(rule_set=rule_set)
            _validate_rule_children(rule_set)
        _log_audit(request.user, 'payroll_ruleset_child_mutation',
                    f'Mutated {model.__name__} for {rule_set.code}',
                    new_values=serializer.validated_data)
        return Response(serializer_class(child).data, status=status.HTTP_200_OK if instance else status.HTTP_201_CREATED)

    def _validate_atomic_children(self, brackets, contributions, categories):
        ordered = sorted(
            brackets,
            key=lambda item: (item['lower_bound'], item.get('order', 0)),
        )
        if ordered:
            if ordered[0]['lower_bound'] != 0:
                raise ValidationError({'tax_brackets': 'Tax brackets must start at zero.'})
            open_ended = [item for item in ordered if item.get('upper_bound') is None]
            if len(open_ended) != 1 or open_ended[0] is not ordered[-1]:
                raise ValidationError({
                    'tax_brackets': 'Exactly one open-ended bracket must be last.',
                })
            for previous, current in zip(ordered, ordered[1:]):
                if previous.get('upper_bound') != current['lower_bound']:
                    raise ValidationError({
                        'tax_brackets': 'Tax brackets must be ordered, contiguous, and gap-free.',
                    })
            for order, item in enumerate(ordered):
                item['order'] = order

        seen_contributions = set()
        for item in contributions:
            key = (item['contribution_type'], item['side'])
            if key in seen_contributions:
                raise ValidationError({
                    'contribution_rates': 'Contribution type and side must be unique within the rule set.',
                })
            seen_contributions.add(key)

        seen_categories = set()
        for order, item in enumerate(categories):
            if item['code'] in seen_categories:
                raise ValidationError({
                    'overtime_categories': 'Overtime code must be unique within the rule set.',
                })
            seen_categories.add(item['code'])
            item['order'] = order

    def _reconcile_children(self, rule_set, model, payload, mode):
        existing = {child.pk: child for child in model.objects.filter(rule_set=rule_set)}
        retained = set()
        for values in payload:
            values = dict(values)
            child_id = values.pop('id', None)
            if mode == 'edit' and child_id is not None:
                child = existing.get(child_id)
                if child is None:
                    raise ValidationError({
                        'detail': 'A child component does not belong to this rule set or is stale.',
                    })
                if child_id in retained:
                    raise ValidationError({'detail': 'A child component was submitted more than once.'})
                retained.add(child_id)
            else:
                child = model(rule_set=rule_set)
            for field, value in values.items():
                setattr(child, field, value)
            child.rule_set = rule_set
            child.save()
            if mode == 'edit':
                retained.add(child.pk)

        if mode == 'edit':
            model.objects.filter(rule_set=rule_set).exclude(pk__in=retained).delete()

    def _rule_set_snapshot(self, rule_set):
        return PayrollRuleSetSerializer(rule_set).data

    @action(detail=True, methods=['post'], url_path='atomic-save')
    def atomic_save(self, request, pk=None):
        self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        mode = data['mode']

        try:
            with transaction.atomic():
                source = PayrollRuleSet.objects.select_for_update().get(pk=pk)
                expected_updated_at = data.get('expected_updated_at')
                if expected_updated_at and source.updated_at != expected_updated_at:
                    raise ValidationError({
                        'detail': 'This payroll rule set changed in another window. Reload it before saving.',
                    })
                if mode == 'edit':
                    self._ensure_mutable(source)
                parent_serializer = PayrollRuleSetCreateSerializer(
                    source if mode == 'edit' else None,
                    data=data['parent_fields'],
                )
                parent_serializer.is_valid(raise_exception=True)
                parent_values = parent_serializer.validated_data
                if parent_values.get('is_active') and PayrollRuleSet.has_active_effective_date_conflict(
                    parent_values['country'],
                    parent_values['tax_profile'],
                    parent_values['effective_from'],
                    exclude_pk=source.pk if mode == 'edit' else None,
                ):
                    raise ValidationError({
                        'parent_fields': {
                            'effective_from': 'Another active rule set already uses this effective date for the same country and tax profile.',
                        },
                    })
                brackets = data['tax_brackets']
                contributions = data['contribution_rates']
                categories = data['overtime_categories']
                self._validate_atomic_children(brackets, contributions, categories)
                old_values = self._rule_set_snapshot(source)

                if mode == 'version':
                    target = PayrollRuleSet.objects.create(**parent_values)
                else:
                    target = source
                    for field, value in parent_values.items():
                        setattr(target, field, value)
                    target.save()

                self._reconcile_children(target, PayrollTaxBracket, brackets, mode)
                self._reconcile_children(target, PayrollContributionRate, contributions, mode)
                self._reconcile_children(target, PayrollOvertimeCategory, categories, mode)
                _validate_rule_children(target)
                target.refresh_from_db()
        except IntegrityError:
            raise ValidationError({
                'detail': 'The rule set could not be saved because another change created a duplicate value. Reload and try again.',
            })

        _log_audit(
            request.user,
            'payroll_ruleset_version_save' if mode == 'version' else 'payroll_ruleset_update',
            f'{"Created version" if mode == "version" else "Updated"} payroll rule set {target.code}',
            new_values=self._rule_set_snapshot(target),
            old_values=old_values,
        )
        return Response(
            PayrollRuleSetSerializer(target).data,
            status=status.HTTP_201_CREATED if mode == 'version' else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'])
    def clone(self, request, pk=None):
        source = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = {
            'name': source.name, 'country': source.country, 'effective_to': source.effective_to,
            'is_active': source.is_active, 'tax_profile': source.tax_profile, 'source': source.source,
            'notes': source.notes, 'validation_status': source.validation_status,
        }
        values.update(serializer.validated_data)
        if values.get('is_active') and PayrollRuleSet.has_active_effective_date_conflict(
            values['country'], values['tax_profile'], values['effective_from'],
        ):
            raise ValidationError({
                'effective_from': 'Another active rule set already uses this effective date for the same country and tax profile.',
            })
        try:
            with transaction.atomic():
                clone = PayrollRuleSet.objects.create(**values)
                for bracket in source.tax_brackets.all():
                    bracket.pk = None
                    bracket.rule_set = clone
                    bracket.save()
                for contribution in source.contribution_rates.all():
                    contribution.pk = None
                    contribution.rule_set = clone
                    contribution.save()
                for category in source.overtime_categories.all():
                    category.pk = None
                    category.rule_set = clone
                    category.save()
                _validate_rule_children(clone)
        except IntegrityError as exc:
            if 'payroll_ruleset_unique_active_effective_date' in str(exc):
                raise ValidationError({
                    'effective_from': 'Another active rule set already uses this effective date for the same country and tax profile.',
                }) from exc
            raise
        _log_audit(request.user, 'payroll_ruleset_clone', f'Cloned rule set {source.code} to {clone.code}',
                    new_values={'code': clone.code, 'version': clone.version, 'effective_from': clone.effective_from})
        return Response(PayrollRuleSetSerializer(clone).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='tax-brackets')
    def tax_brackets(self, request, pk=None):
        return self._child_mutation(request, self.get_object(), PayrollTaxBracket, PayrollTaxBracketSerializer)

    @action(detail=True, methods=['patch', 'put'], url_path=r'tax-brackets/(?P<child_id>\d+)')
    def update_tax_bracket(self, request, pk=None, child_id=None):
        return self._child_mutation(request, self.get_object(), PayrollTaxBracket, PayrollTaxBracketSerializer, child_id)

    @action(detail=True, methods=['delete'], url_path=r'tax-brackets/(?P<child_id>\d+)')
    def delete_tax_bracket(self, request, pk=None, child_id=None):
        return self._delete_child(request, self.get_object(), PayrollTaxBracket, child_id)

    @action(detail=True, methods=['post'], url_path='contributions')
    def contributions(self, request, pk=None):
        return self._child_mutation(request, self.get_object(), PayrollContributionRate, PayrollContributionRateSerializer)

    @action(detail=True, methods=['patch', 'put'], url_path=r'contributions/(?P<child_id>\d+)')
    def update_contribution(self, request, pk=None, child_id=None):
        return self._child_mutation(request, self.get_object(), PayrollContributionRate, PayrollContributionRateSerializer, child_id)

    @action(detail=True, methods=['delete'], url_path=r'contributions/(?P<child_id>\d+)')
    def delete_contribution(self, request, pk=None, child_id=None):
        return self._delete_child(request, self.get_object(), PayrollContributionRate, child_id)

    @action(detail=True, methods=['post'], url_path='overtime-categories')
    def overtime_categories(self, request, pk=None):
        return self._child_mutation(request, self.get_object(), PayrollOvertimeCategory, PayrollOvertimeCategorySerializer)

    @action(detail=True, methods=['patch', 'put'], url_path=r'overtime-categories/(?P<child_id>\d+)')
    def update_overtime_category(self, request, pk=None, child_id=None):
        return self._child_mutation(request, self.get_object(), PayrollOvertimeCategory, PayrollOvertimeCategorySerializer, child_id)

    @action(detail=True, methods=['delete'], url_path=r'overtime-categories/(?P<child_id>\d+)')
    def delete_overtime_category(self, request, pk=None, child_id=None):
        return self._delete_child(request, self.get_object(), PayrollOvertimeCategory, child_id)

    def _delete_child(self, request, rule_set, model, child_id):
        self._ensure_mutable(rule_set)
        child = model.objects.filter(rule_set=rule_set, pk=child_id).first()
        if child is None:
            raise ValidationError({'detail': 'Child component does not belong to this rule set.'})
        with transaction.atomic():
            child.delete()
            _validate_rule_children(rule_set)
        _log_audit(request.user, 'payroll_ruleset_child_delete', f'Deleted {model.__name__} from {rule_set.code}')
        return Response(status=status.HTTP_204_NO_CONTENT)

    def perform_create(self, serializer):
        actor = self.request.user
        try:
            instance = serializer.save()
        except IntegrityError as exc:
            if 'payroll_ruleset_unique_active_effective_date' in str(exc):
                raise ValidationError({
                    'effective_from': 'Another active rule set already uses this effective date for the same country and tax profile.',
                }) from exc
            raise
        _log_audit(actor, 'payroll_ruleset_create', f'Created rule set {instance.code}',
                   new_values={'code': instance.code, 'version': instance.version})

    def perform_update(self, serializer):
        actor = self.request.user
        old = serializer.instance
        old_values = {'code': old.code, 'version': old.version, 'is_active': old.is_active}
        instance = serializer.save()
        _log_audit(actor, 'payroll_ruleset_update', f'Updated rule set {instance.code}',
                   new_values={'code': instance.code, 'version': instance.version, 'is_active': instance.is_active},
                   old_values=old_values)

    def perform_destroy(self, instance):
        if instance.runs.exists():
            raise ValidationError('This rule set is referenced by a payroll run and is immutable. Create a new version instead.')
        actor = self.request.user
        code = instance.code
        instance.delete()
        _log_audit(actor, 'payroll_ruleset_delete', f'Deleted rule set {code}')


# ---------------------------------------------------------------------------
# Work calendar
# ---------------------------------------------------------------------------

class PayrollWorkCalendarViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'payroll'
    queryset = PayrollWorkCalendar.objects.all().prefetch_related('workdays')
    serializer_class = PayrollWorkCalendarSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['country', 'year', 'source']
    filterset_fields = ['country', 'year', 'is_active']
    pagination_class = None
    permission_action_map = {
        'list': 'view', 'retrieve': 'view', 'month_summary': 'view',
        'create': 'configure', 'update': 'configure', 'partial_update': 'configure',
        'destroy': 'configure', 'generate_year': 'configure',
        'add_holiday': 'configure', 'update_holiday': 'configure', 'remove_holiday': 'configure',
    }

    @action(detail=True, methods=['post'])
    def generate_year(self, request, pk=None):
        """Generate workdays for this calendar year from weekday defaults."""
        calendar = self.get_object()
        from .services.calendar_service import generate_workdays_for_year
        with transaction.atomic():
            count = generate_workdays_for_year(calendar)
        _log_audit(request.user, 'payroll_calendar_generate',
                    f'Generated workdays for {calendar.country} {calendar.year}: {count} days')
        return Response({'status': 'generated', 'workday_count': count})

    def perform_create(self, serializer):
        actor = self.request.user
        instance = serializer.save()
        _log_audit(actor, 'payroll_calendar_create',
                    f'Created work calendar {instance.country} {instance.year}')

    def perform_update(self, serializer):
        actor = self.request.user
        old = serializer.instance
        old_values = {'country': old.country, 'year': old.year, 'is_active': old.is_active}
        instance = serializer.save()
        _log_audit(actor, 'payroll_calendar_update',
                    f'Updated work calendar {instance.country} {instance.year}',
                    new_values={'country': instance.country, 'year': instance.year,
                                'is_active': instance.is_active},
                    old_values=old_values)

    def perform_destroy(self, instance):
        actor = self.request.user
        label = f'{instance.country} {instance.year}'
        instance.delete()
        _log_audit(actor, 'payroll_calendar_delete',
                    f'Deleted work calendar {label}')

    @action(detail=True, methods=['get'])
    def month_summary(self, request, pk=None):
        """Return working-day summary for a specific month."""
        calendar = self.get_object()
        try:
            month = int(request.query_params.get('month', 1))
        except (TypeError, ValueError):
            return Response({'detail': 'month must be an integer from 1 to 12.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not 1 <= month <= 12:
            return Response({'detail': 'month must be an integer from 1 to 12.'},
                            status=status.HTTP_400_BAD_REQUEST)
        from .services.calendar_service import get_month_summary
        summary = get_month_summary(calendar, month)
        return Response(summary)

    @action(detail=True, methods=['post'], url_path='holidays/add')
    def add_holiday(self, request, pk=None):
        """Add a holiday to the calendar (sets is_holiday, is_working_day=False)."""
        calendar = self.get_object()
        date_str = request.data.get('date')
        name = (request.data.get('name') or '').strip()
        if not date_str or not name:
            return Response(
                {'detail': 'date and name are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            parts = date_str.split('-')
            holiday_date = date(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            return Response({'detail': 'date must be in YYYY-MM-DD format.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if holiday_date.year != calendar.year:
            return Response(
                {'detail': f'Holiday date must be in {calendar.year}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .services.calendar_service import add_holiday
        with transaction.atomic():
            workday = add_holiday(calendar, holiday_date, name)
        _log_audit(request.user, 'payroll_holiday_add',
                    f'Added holiday {name} on {holiday_date} to {calendar.country} {calendar.year}',
                    new_values={'date': str(holiday_date), 'name': name})
        return Response(PayrollWorkdaySerializer(workday).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'],
            url_path=r'holidays/(?P<workday_id>\d+)/update')
    def update_holiday(self, request, pk=None, workday_id=None):
        """Update a holiday's name."""
        calendar = self.get_object()
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': 'name is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            workday = calendar.workdays.get(pk=workday_id)
        except PayrollWorkday.DoesNotExist:
            return Response({'detail': 'Workday not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not workday.is_holiday:
            return Response({'detail': 'This workday is not a holiday.'},
                            status=status.HTTP_400_BAD_REQUEST)
        old_name = workday.holiday_name
        with transaction.atomic():
            workday.holiday_name = name
            workday.save(update_fields=['holiday_name'])
        _log_audit(request.user, 'payroll_holiday_update',
                    f'Updated holiday name from "{old_name}" to "{name}" on {workday.date}',
                    new_values={'name': name}, old_values={'name': old_name})
        return Response(PayrollWorkdaySerializer(workday).data)

    @action(detail=True, methods=['delete'],
            url_path=r'holidays/(?P<workday_id>\d+)/remove')
    def remove_holiday(self, request, pk=None, workday_id=None):
        """Remove a holiday (restores working day if it's a weekday)."""
        calendar = self.get_object()
        try:
            workday = calendar.workdays.get(pk=workday_id)
        except PayrollWorkday.DoesNotExist:
            return Response({'detail': 'Workday not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not workday.is_holiday:
            return Response({'detail': 'This workday is not a holiday.'},
                            status=status.HTTP_400_BAD_REQUEST)
        old_name = workday.holiday_name
        from .services.calendar_service import remove_holiday
        with transaction.atomic():
            remove_holiday(workday)
        _log_audit(request.user, 'payroll_holiday_remove',
                    f'Removed holiday "{old_name}" on {workday.date}',
                    old_values={'name': old_name, 'date': str(workday.date)})
        return Response({'status': 'removed'})


# ---------------------------------------------------------------------------
# Payroll runs
# ---------------------------------------------------------------------------

class PayrollRunViewSet(PluginPermissionMixin, viewsets.ModelViewSet):
    plugin_name = 'payroll'
    queryset = PayrollRun.objects.all().select_related(
        'rule_set', 'created_by', 'finalized_by',
    )
    serializer_class = PayrollRunSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['notes']
    filterset_fields = ['year', 'month', 'status']
    permission_action_map = {
        'list': 'view', 'retrieve': 'view', 'lines': 'view',
        'period_closure_status': 'view', 'preview': 'view',
        'create': 'manage', 'update': 'manage', 'partial_update': 'manage',
        'destroy': 'manage', 'generate': 'manage', 'generate_line': 'manage',
        'finalize': 'manage', 'cancel': 'manage',
        'export_excel': 'export', 'payslip': 'export',
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        allowed_ids = _allowed_payroll_user_ids(self.request.user)
        if allowed_ids is not None:
            queryset = queryset.filter(lines__user_id__in=allowed_ids).distinct()
        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return PayrollRunCreateSerializer
        return PayrollRunSerializer

    def _ensure_draft_mutable(self, run):
        if run.status != 'draft':
            return Response(
                {'detail': 'Only draft payroll runs can be changed or deleted.'},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    def update(self, request, *args, **kwargs):
        blocked = self._ensure_draft_mutable(self.get_object())
        if blocked:
            return blocked
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        blocked = self._ensure_draft_mutable(self.get_object())
        if blocked:
            return blocked
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        blocked = self._ensure_draft_mutable(self.get_object())
        if blocked:
            return blocked
        return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        actor = self.request.user
        draft_line_count = instance.lines.count()
        draft_entry_count = instance.source_entries.filter(status='draft').count()
        period_label = instance.period_label
        run_id = instance.pk
        super().perform_destroy(instance)
        _log_audit(
            actor,
            'payroll_run_delete',
            f'Deleted draft payroll run {period_label}',
            old_values={
                'run_id': run_id,
                'period': period_label,
                'line_count': draft_line_count,
                'source_entry_count': draft_entry_count,
            },
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        year = serializer.validated_data['year']
        month = serializer.validated_data['month']
        user_ids = serializer.validated_data.get('user_ids', [])
        notes = serializer.validated_data.get('notes', '')

        # Resolve rule set
        from .models import PayrollRuleSet, PayrollConfiguration
        config = PayrollConfiguration.get_singleton()
        month_start = date(year, month, 1)
        rule_set = PayrollRuleSet.resolve_for_date(month_start, config.default_tax_profile)
        if not rule_set:
            return Response(
                {'detail': f'No active payroll rule set effective on {month_start}. '
                           f'Create one in Payroll Settings first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                existing = PayrollRun.objects.filter(
                    year=year, month=month, status__in=['draft', 'finalized'],
                ).first()
                if existing:
                    return Response(
                        {'detail': f'An active payroll run already exists for {year}-{month:02d}. '
                                   f'Use the existing run or cancel it first.'},
                        status=status.HTTP_409_CONFLICT,
                    )

                run = PayrollRun.objects.create(
                    year=year, month=month, status='draft',
                    rule_set=rule_set, notes=notes,
                    created_by=request.user,
                )
                users = self._resolve_users(user_ids)
                if users:
                    generate_draft_run(run, users)
        except Exception as exc:
            logger.error('Payroll run creation failed: %s', exc, exc_info=True)
            return Response(
                {'detail': 'Payroll run creation failed. Please review the input and try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _log_audit(request.user, 'payroll_run_create',
                    f'Created payroll run {run.period_label}',
                    new_values={'year': year, 'month': month, 'run_id': run.id})

        return Response(
            PayrollRunSerializer(run).data,
            status=status.HTTP_201_CREATED,
        )

    def _resolve_users(self, user_ids):
        allowed_ids = _allowed_payroll_user_ids(self.request.user)
        requested_ids = set(user_ids) if user_ids else None
        if allowed_ids is not None:
            requested_ids = allowed_ids if requested_ids is None else requested_ids & allowed_ids
        if requested_ids is not None:
            return list(User.objects.filter(id__in=requested_ids, is_active=True))
        # All active users that have a wage assignment
        from .models import WageAssignment
        user_ids_with_wage = set(
            WageAssignment.objects.filter(is_active=True).values_list('user_id', flat=True)
        )
        return list(User.objects.filter(id__in=user_ids_with_wage, is_active=True))

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Regenerate draft lines for the run."""
        run = self.get_object()
        if run.status != 'draft':
            return Response(
                {'detail': f'Cannot regenerate a {run.status} run.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PayrollRunGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_ids = serializer.validated_data.get('user_ids', [])
        users = self._resolve_users(user_ids)
        try:
            lines = generate_draft_run(run, users)
        except Exception as e:
            logger.error('Payroll draft generation failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payroll draft generation failed. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _log_audit(request.user, 'payroll_run_generate',
                    f'Regenerated payroll run {run.period_label}',
                    new_values={'run_id': run.id, 'line_count': len(lines)})
        return Response({
            'status': 'generated',
            'line_count': len(lines),
            'run': PayrollRunSerializer(run).data,
        })

    @action(detail=True, methods=['post'])
    def generate_line(self, request, pk=None):
        """Regenerate a single user's payroll line within a draft run."""
        run = self.get_object()
        if run.status != 'draft':
            return Response(
                {'detail': f'Cannot regenerate a {run.status} run.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user_id = request.data.get('user_id')
        if not user_id:
            return Response(
                {'detail': 'user_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.get(id=int(user_id), is_active=True)
        except (ValueError, User.DoesNotExist):
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        allowed_ids = _allowed_payroll_user_ids(request.user)
        if allowed_ids is not None and user.id not in allowed_ids:
            raise PermissionDenied('You cannot generate payroll for this user.')

        from .services.payroll_service import regenerate_single_line
        try:
            line = regenerate_single_line(run, user)
        except Exception as e:
            logger.error('Single line generation failed: %s', e, exc_info=True)
            return Response(
                {'detail': f'Failed to generate payroll for {user.username}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _log_audit(request.user, 'payroll_run_generate_line',
                    f'Regenerated payroll line for {user.username} in {run.period_label}',
                    new_values={'run_id': run.id, 'user_id': user.id, 'line_id': line.id})
        return Response({
            'status': 'generated',
            'line': PayrollLineSerializer(line).data,
        })

    @action(detail=True, methods=['get'], url_path='period-closure-status')
    def period_closure_status(self, request, pk=None):
        """Return TL approval-period closure readiness for this run."""
        run = self.get_object()
        readiness = get_period_closure_status(run)
        readiness['period'] = readiness['period'].isoformat()
        readiness['requires_tl_closed_before_finalize'] = (
            PayrollConfiguration.get_singleton().require_tl_closed_before_finalize
        )
        return Response(readiness)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        run = self.get_object()
        try:
            run = finalize_run(run, request.user)
        except Exception as e:
            logger.error('Payroll finalization failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payroll finalization failed. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _log_audit(request.user, 'payroll_run_finalize',
                    f'Finalized payroll run {run.period_label}',
                    new_values={'run_id': run.id, 'line_count': run.lines.count()})
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        run = self.get_object()
        try:
            run = cancel_run(run, request.user)
        except Exception as e:
            logger.error('Payroll cancellation failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payroll cancellation failed. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _log_audit(request.user, 'payroll_run_cancel',
                    f'Cancelled payroll run {run.period_label}',
                    new_values={'run_id': run.id})
        return Response(PayrollRunSerializer(run).data)

    @action(detail=True, methods=['get'])
    def lines(self, request, pk=None):
        """List payroll lines for a run."""
        run = self.get_object()
        lines = run.lines.all().select_related('user', 'user__profile').order_by('user__username')
        serializer = PayrollLineSerializer(lines, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def preview(self, request):
        """Non-persisting calculation preview for a user/month."""
        user_id = request.data.get('user_id')
        year = request.data.get('year')
        month = request.data.get('month')
        if not all([user_id, year, month]):
            return Response(
                {'detail': 'user_id, year, and month are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user_id_int = int(user_id)
            user = User.objects.get(id=user_id_int)
        except (ValueError, User.DoesNotExist):
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        allowed_ids = _allowed_payroll_user_ids(request.user)
        if allowed_ids is not None and user.id not in allowed_ids:
            raise PermissionDenied('You cannot preview this user\'s payroll.')

        try:
            year_int = int(year)
            month_int = int(month)
        except (TypeError, ValueError):
            return Response({'detail': 'year and month must be numeric.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not 2020 <= year_int <= 2100 or not 1 <= month_int <= 12:
            return Response({'detail': 'year or month is outside the supported range.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            inp = build_calculation_input(user, year_int, month_int)
            result = calculate_payroll(inp)
        except Exception as e:
            logger.error('Payroll preview failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payroll preview failed. Please verify the selected period and wage data.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'user_id': result.user_id,
            'user_display': result.user_display,
            'gross_monthly_wage': str(result.gross_monthly_wage),
            'overtime_hours': str(result.overtime_hours),
            'overtime_amount': str(result.overtime_amount),
            'standby_hours': str(result.standby_hours),
            'standby_amount': str(result.standby_amount),
            'total_gross': str(result.total_gross),
            'employee_social': str(result.employee_social),
            'employee_health': str(result.employee_health),
            'income_tax': str(result.income_tax),
            'total_employee_deductions': str(result.total_employee_deductions),
            'net_pay': str(result.net_pay),
            'employer_social': str(result.employer_social),
            'employer_health': str(result.employer_health),
            'total_employer_cost': str(result.total_employer_cost),
            'warnings': result.warnings,
            'carryover_breakdown': result.carryover_breakdown,
            'rule_set_code': result.rule_set_code,
        })

    @action(detail=True, methods=['get'])
    def export_excel(self, request, pk=None):
        """Export the run as an Excel file."""
        run = self.get_object()
        if run.status != 'finalized':
            return Response(
                {'detail': 'Payroll exports are available only for finalized runs.'},
                status=status.HTTP_409_CONFLICT,
            )
        from .services.export_service import generate_payroll_excel
        try:
            data = generate_payroll_excel(run)
            response = FileResponse(
                data,
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
            response['Content-Disposition'] = (
                f'attachment; filename="payroll_{run.year}-{run.month:02d}.xlsx"'
            )
            _log_audit(request.user, 'payroll_export_excel',
                        f'Exported payroll run {run.period_label} as Excel')
            return response
        except Exception as e:
            logger.error('Excel export failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payroll export failed. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['get'])
    def payslip(self, request, pk=None):
        """Download a single employee's payslip as PDF.

        Query param: ``line_id`` (PayrollLine ID).
        """
        run = self.get_object()
        if run.status != 'finalized':
            return Response(
                {'detail': 'Payslips are available only for finalized runs.'},
                status=status.HTTP_409_CONFLICT,
            )
        line_id = request.query_params.get('line_id')
        if not line_id:
            return Response({'detail': 'line_id query parameter is required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        line = run.lines.filter(id=line_id).first()
        if not line:
            return Response({'detail': 'Payroll line not found in this run.'},
                            status=status.HTTP_404_NOT_FOUND)

        from .services.export_service import generate_payslip_pdf
        try:
            data = generate_payslip_pdf(line)
            response = FileResponse(data, content_type='application/pdf')
            response['Content-Disposition'] = (
                f'attachment; filename="payslip_{line.user.username}_{run.period_label}.pdf"'
            )
            _log_audit(request.user, 'payroll_payslip_pdf',
                        f'Downloaded payslip for {line.user.username} ({run.period_label})')
            return response
        except Exception as e:
            logger.error('Payslip PDF failed: %s', e, exc_info=True)
            return Response(
                {'detail': 'Payslip generation failed. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
