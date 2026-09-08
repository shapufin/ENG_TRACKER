"""CSV export of the team skill matrix."""
import csv

from django.http import StreamingHttpResponse

from plugins.skills.models import UserSkill, Skill


class Echo:
    """An object that implements just the write method of the file-like
    interface. Used to stream CSV rows without buffering the whole file."""
    def write(self, value):
        return value


def export_matrix_csv(visible_ids, category_code=None, search=None):
    """Return a StreamingHttpResponse with the team skill matrix as CSV.

    Columns: Username, Skill, Category, Level, Notes.
    One row per UserSkill (not per user).
    """
    skills_qs = Skill.objects.filter(is_active=True)
    if category_code:
        skills_qs = skills_qs.filter(category__code=category_code)
    skill_ids = list(skills_qs.values_list('id', flat=True))

    # Apply search filter: narrow visible_ids to users matching the search term.
    if search:
        from django.contrib.auth.models import User
        from django.db.models import Q
        matching = User.objects.filter(
            is_active=True,
            id__in=visible_ids,
        ).filter(
            Q(username__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(user_skills__skill__name__icontains=search)
        ).distinct().values_list('id', flat=True)
        visible_ids = set(matching)

    ratings = UserSkill.objects.filter(
        user_id__in=visible_ids,
        skill_id__in=skill_ids,
    ).select_related('user', 'skill', 'skill__category').order_by(
        'user__username', 'skill__category__name', 'skill__name'
    )

    rows = [['Username', 'Skill', 'Category', 'Level', 'Notes']]
    for r in ratings:
        rows.append([
            r.user.username,
            r.skill.name,
            r.skill.category.name,
            str(r.level),
            r.notes,
        ])

    pseudo_buffer = Echo()
    writer = csv.writer(pseudo_buffer)
    response = StreamingHttpResponse(
        (writer.writerow(row) for row in rows),
        content_type="text/csv",
    )
    response['Content-Disposition'] = 'attachment; filename="skills_matrix.csv"'
    return response
