"""Seed deterministic demo skill ratings for visual review.

Writes UserSkill rows directly via the ORM (management command = trusted,
same precedent as seed_e2e_data). Idempotent via update_or_create — re-running
re-rolls levels deterministically for the same --seed.
"""
import random

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from plugins.skills.models import Skill, UserSkill


class Command(BaseCommand):
    help = "Seed deterministic demo skill ratings across active users/skills."

    def add_arguments(self, parser):
        parser.add_argument("--seed", type=int, default=42)
        parser.add_argument(
            "--coverage",
            type=float,
            default=0.7,
            help="Fraction of user×skill pairs to rate (0-1).",
        )

    def handle(self, *args, **options):
        rng = random.Random(options["seed"])
        users = list(User.objects.filter(is_active=True))
        skills = list(Skill.objects.filter(is_active=True).select_related("category"))
        # Weighted distribution: L3/L4 common, L5 rare, L1/L2 minority.
        population = [1, 2, 3, 3, 3, 4, 4, 4, 4, 5]
        created = 0
        updated = 0
        pairs = [(u, s) for u in users for s in skills]
        for user, skill in pairs:
            if rng.random() > options["coverage"]:
                continue
            level = rng.choice(population)
            _, was_created = UserSkill.objects.update_or_create(
                user=user, skill=skill, defaults={"level": level}
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"Skills demo seed: {created} created, {updated} updated, "
                f"{len(pairs)} possible pairs."
            )
        )
