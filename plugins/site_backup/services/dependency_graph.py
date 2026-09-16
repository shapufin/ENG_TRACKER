"""
Model-level FK dependency graph, built from Django's own model metadata
(``_meta.related_objects``) rather than hand-rolled DB introspection.

"Dependent" here means: a model that has a ForeignKey pointing *at* another
model. If you restore/overwrite rows of the parent model, every dependent
model must be restored too (or its rows would reference PKs that may no
longer mean the same thing) — and when wiping tables before a restore,
dependents must be deleted before their parent to satisfy FK constraints.
"""
from django.apps import apps as django_apps

from .backup import EXCLUDED_APPS


def _label(model) -> str:
    return f'{model._meta.app_label}.{model._meta.model_name}'


def _direct_dependents(model) -> set:
    """Models with a FK field pointing at ``model``."""
    dependents = set()
    for rel in model._meta.related_objects:
        related_model = rel.related_model
        if related_model._meta.app_label in EXCLUDED_APPS:
            continue
        if related_model is model:
            continue
        dependents.add(_label(related_model))
    return dependents


def build_dependents_map() -> dict:
    """Map of ``model_label -> set(direct dependent model_labels)`` for every installed model."""
    graph = {}
    for model in django_apps.get_models():
        if model._meta.app_label in EXCLUDED_APPS:
            continue
        graph[_label(model)] = _direct_dependents(model)
    return graph


def dependent_closure(model_labels, graph: dict = None) -> set:
    """Every model transitively dependent on any of ``model_labels`` (BFS, cycle-safe)."""
    graph = graph if graph is not None else build_dependents_map()
    seen = set(model_labels)
    queue = list(model_labels)
    while queue:
        current = queue.pop()
        for child in graph.get(current, ()):
            if child not in seen:
                seen.add(child)
                queue.append(child)
    return seen


def topological_delete_order(model_labels, graph: dict = None) -> list:
    """Order ``model_labels`` children-first, so deleting in this order never
    violates a FK constraint. Ties broken by label for determinism."""
    graph = graph if graph is not None else build_dependents_map()
    subset = set(model_labels)
    # in_degree counts, within the subset, how many other subset-members this
    # model is a *parent* of (i.e. how many subset dependents point at it).
    in_degree = {label: 0 for label in subset}
    for label in subset:
        for child in graph.get(label, ()):
            if child in subset:
                in_degree[child] += 1

    ordered = []
    remaining = set(subset)
    while remaining:
        # Pick models nothing-remaining-in-subset still depends on (leaves first).
        ready = sorted(
            label for label in remaining
            if not any(child in remaining for child in graph.get(label, ()))
        )
        if not ready:
            # Cycle among FKs (rare, e.g. mutual self-reference) — break
            # deterministically rather than looping forever.
            ready = [sorted(remaining)[0]]
        for label in ready:
            ordered.append(label)
            remaining.discard(label)
    return ordered


def topological_save_order(model_labels, graph: dict = None) -> list:
    """Order ``model_labels`` parents-first — the reverse of delete order —
    so a row's FK targets already exist when the row is saved."""
    return list(reversed(topological_delete_order(model_labels, graph)))
