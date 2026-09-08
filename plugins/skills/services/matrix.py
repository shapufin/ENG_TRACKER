"""Matrix builder for the TL team skills view.

Builds a paginated payload: one row per user, with their skills embedded.
Also computes per-skill coverage stats for the coverage endpoint.
"""
from collections import defaultdict

from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework.pagination import PageNumberPagination

from plugins.skills.models import UserSkill, Skill


class MatrixPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


def build_matrix_queryset(visible_ids, filters=None):
    """Return a queryset of User IDs in the visible set, filtered.

    Returns User objects (for the matrix rows) — not UserSkill objects.
    Filtering by skill/category/level narrows which users appear.
    """
    qs = User.objects.filter(is_active=True, id__in=visible_ids)
    if not filters:
        return qs.distinct().order_by('username')

    skill_ids = filters.get('skill_id')
    category_code = filters.get('category')
    min_level = filters.get('min_level')
    max_level = filters.get('max_level')
    search = filters.get('search')

    user_skill_filter_qs = UserSkill.objects.all()
    if skill_ids:
        user_skill_filter_qs = user_skill_filter_qs.filter(skill_id__in=skill_ids)
    if min_level:
        user_skill_filter_qs = user_skill_filter_qs.filter(level__gte=int(min_level))
    if max_level:
        user_skill_filter_qs = user_skill_filter_qs.filter(level__lte=int(max_level))
    if category_code:
        user_skill_filter_qs = user_skill_filter_qs.filter(skill__category__code=category_code)

    if skill_ids or min_level or max_level or category_code:
        matching_user_ids = user_skill_filter_qs.values_list('user_id', flat=True)
        qs = qs.filter(id__in=set(matching_user_ids))

    if search:
        qs = qs.filter(
            Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(user_skills__skill__name__icontains=search)
        )

    return qs.distinct().order_by('username')


def build_matrix_rows(users, category_code=None):
    """Build matrix rows for a list of users in a single batched query.

    Avoids N+1: fetches all UserSkill rows for the given users in one query
    with select_related('skill', 'skill__category'), then groups in memory.
    """
    user_ids = [u.id for u in users]
    all_skills = UserSkill.objects.filter(
        user_id__in=user_ids
    ).select_related('skill', 'skill__category').order_by(
        'skill__category__name', 'skill__name'
    )

    if category_code:
        all_skills = all_skills.filter(skill__category__code=category_code)

    # Group by user_id
    by_user = defaultdict(list)
    for us in all_skills:
        by_user[us.user_id].append({
            # user_skill_id is the UserSkill PK — the frontend `rate`
            # action is detail=True on UserSkillViewSet and needs this,
            # NOT the skill_id (B1 regression fix).
            'user_skill_id': us.id,
            'skill_id': us.skill_id,
            'skill_name': us.skill.name,
            'category_name': us.skill.category.name,
            'level': us.level,
        })

    return [
        {
            'user_id': u.id,
            'username': u.username,
            # Full name for the member profile column; falls back to the
            # username when first/last name are unset.
            'full_name': (u.get_full_name() or '').strip() or u.username,
            'skills': by_user.get(u.id, []),
        }
        for u in users
    ]


def build_matrix_row(user, category_code=None):
    """Build a single matrix row for a user (convenience wrapper).

    For paginated views, prefer ``build_matrix_rows`` (batched) to avoid N+1.
    """
    return build_matrix_rows([user], category_code)[0]


def build_coverage_stats(visible_ids, category_code=None, top_n=None):
    """Compute per-skill team coverage stats.

    Returns a list of dicts: skill_id, skill_name, category_name,
    team_count, avg_level.

    ``top_n`` (optional positive int) truncates the result list to limit
    payload size (S3). Non-positive values are ignored (no limit). The
    list is truncated after computing all stats — at plan scale (<100
    skills) this is fine; revisit if scale exceeds ~500.
    """
    skills_qs = Skill.objects.filter(is_active=True)
    if category_code:
        skills_qs = skills_qs.filter(category__code=category_code)

    skills_qs = skills_qs.select_related('category').order_by(
        'category__name', 'name'
    )

    # Batch-fetch all UserSkill ratings for visible users.
    ratings = UserSkill.objects.filter(
        user_id__in=visible_ids
    ).select_related('skill')

    # Group by skill_id.
    skill_ratings = defaultdict(list)
    for r in ratings:
        skill_ratings[r.skill_id].append(r.level)

    results = []
    for skill in skills_qs:
        levels = skill_ratings.get(skill.id, [])
        team_count = len(levels)
        avg_level = round(sum(levels) / team_count, 2) if team_count else 0.0
        results.append({
            'skill_id': skill.id,
            'skill_name': skill.name,
            'category_name': skill.category.name,
            'team_count': team_count,
            'avg_level': avg_level,
        })
    if top_n and top_n > 0:
        results = results[:top_n]
    return results
