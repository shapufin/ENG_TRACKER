"""
Skills Matrix plugin models.

Conventions follow the project's plugin pattern (see ticket_kpi, organigrama):
plain ``models.Model`` with explicit ``created_at``/``updated_at``. Soft delete
is not used on transactional records; ``is_active`` on catalog items
(SkillCategory, Skill) is a visibility flag matching ``Tech.is_active``.

The plugin owns ONLY skill-specific data:
- ``SkillCategory`` — admin-managed grouping for the skill catalog.
- ``Skill`` — admin-managed catalog item.
- ``UserSkill`` — one rating per user per skill (1-5 proficiency).
- ``SkillRatingHistory`` — audit log of every level change.

It reuses existing ``auth.User`` and ``UserProfile`` for scoping via
``get_team_member_ids()``. It does NOT duplicate users, teams, or permissions.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class SkillCategory(models.Model):
    """Admin-managed grouping for the skill catalog."""

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Skill Category'
        verbose_name_plural = 'Skill Categories'
        indexes = [
            models.Index(fields=['is_active', 'name']),
        ]

    def __str__(self):
        return self.name


class Skill(models.Model):
    """Admin-managed catalog item. Ordering is automatic (A-Z by name)."""

    category = models.ForeignKey(
        SkillCategory,
        on_delete=models.PROTECT,
        related_name='skills',
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Skill'
        verbose_name_plural = 'Skills'
        constraints = [
            models.UniqueConstraint(fields=['category', 'name'], name='skill_category_name_unique'),
            models.UniqueConstraint(fields=['code'], name='skill_code_unique'),
        ]
        indexes = [
            models.Index(fields=['category', 'is_active', 'name']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name


class UserSkill(models.Model):
    """One proficiency rating per user per skill (1-5 scale)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_skills',
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.CASCADE,
        related_name='user_skills',
    )
    level = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Proficiency level (1=Foundational, 5=Mastery).",
    )
    notes = models.TextField(blank=True)
    last_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='skills_updated',
    )
    last_updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-last_updated_at']
        verbose_name = 'User Skill'
        verbose_name_plural = 'User Skills'
        constraints = [
            models.UniqueConstraint(fields=['user', 'skill'], name='user_skill_unique'),
        ]
        indexes = [
            models.Index(fields=['user', 'skill']),
            models.Index(fields=['skill', 'level']),
        ]

    def __str__(self):
        return f"{self.user.username} – {self.skill.name} (L{self.level})"


class SkillRatingHistory(models.Model):
    """Audit log of every UserSkill level change (create/update/delete).

    ``user_skill`` is SET_NULL (not CASCADE) so prior history rows survive
    when a UserSkill is deleted — the full audit trail (create → update →
    delete) remains queryable via the denormalized ``user``/``skill``
    fields. CASCADE would erase all but the final deletion row.
    """

    user_skill = models.ForeignKey(
        UserSkill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='history',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='skill_rating_history',
    )
    skill = models.ForeignKey(
        Skill,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rating_history',
    )
    old_level = models.PositiveSmallIntegerField(null=True, blank=True)
    new_level = models.PositiveSmallIntegerField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='skill_rating_changes',
    )
    source = models.CharField(max_length=20)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']
        verbose_name = 'Skill Rating History'
        verbose_name_plural = 'Skill Rating History'
        indexes = [
            models.Index(fields=['user_skill', 'changed_at']),
            models.Index(fields=['user_id', 'changed_at']),
            models.Index(fields=['skill_id', 'changed_at']),
        ]

    def __str__(self):
        return f"{self.user_skill} {self.old_level}→{self.new_level} ({self.source})"
