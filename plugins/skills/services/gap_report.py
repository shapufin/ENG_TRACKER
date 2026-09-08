"""Skill gap report: skills where team average proficiency is below a threshold."""
from plugins.skills.services.matrix import build_coverage_stats


def build_gap_report(visible_ids, category_code=None, threshold=None, top_n=None):
    """Return skills where the team average level is below a threshold.

    A skill is a "gap" if ``avg_level < threshold`` (when a threshold is
    provided). Returns a list of coverage dicts filtered to gap skills,
    sorted by avg_level ascending (worst gaps first).

    ``top_n`` (optional positive int) truncates the result to the N worst
    gaps (lowest avg_level). Non-positive values are ignored (S3).
    """
    all_coverage = build_coverage_stats(visible_ids, category_code)
    gaps = []
    for cov in all_coverage:
        if cov['team_count'] == 0:
            continue
        if threshold is not None and cov['avg_level'] < threshold:
            gaps.append(cov)
    gaps = sorted(gaps, key=lambda g: g['avg_level'])
    if top_n and top_n > 0:
        gaps = gaps[:top_n]
    return gaps
