from django.test import TestCase

from plugins.site_backup.services import dependency_graph


class DependencyGraphTests(TestCase):
    def test_auth_user_has_dependents(self):
        graph = dependency_graph.build_dependents_map()
        self.assertIn('auth.user', graph)
        # Plenty of models FK to User (overtime logs, standby logs, profiles...).
        self.assertTrue(len(graph['auth.user']) > 0)

    def test_dependent_closure_includes_direct_and_transitive_children(self):
        graph = {
            'a': {'b'},
            'b': {'c'},
            'c': set(),
            'd': set(),
        }
        closure = dependency_graph.dependent_closure(['a'], graph)
        self.assertEqual(closure, {'a', 'b', 'c'})

    def test_dependent_closure_is_cycle_safe(self):
        graph = {'a': {'b'}, 'b': {'a'}}
        closure = dependency_graph.dependent_closure(['a'], graph)
        self.assertEqual(closure, {'a', 'b'})

    def test_topological_delete_order_puts_children_before_parents(self):
        # b depends on a (b has FK -> a), c depends on b.
        graph = {'a': {'b'}, 'b': {'c'}, 'c': set()}
        order = dependency_graph.topological_delete_order(['a', 'b', 'c'], graph)
        self.assertEqual(order, ['c', 'b', 'a'])

    def test_topological_save_order_is_reverse_of_delete_order(self):
        graph = {'a': {'b'}, 'b': {'c'}, 'c': set()}
        delete_order = dependency_graph.topological_delete_order(['a', 'b', 'c'], graph)
        save_order = dependency_graph.topological_save_order(['a', 'b', 'c'], graph)
        self.assertEqual(save_order, list(reversed(delete_order)))
        self.assertEqual(save_order, ['a', 'b', 'c'])

    def test_topological_order_handles_disconnected_models(self):
        graph = {'a': {'b'}, 'b': set(), 'z': set()}
        order = dependency_graph.topological_delete_order(['a', 'b', 'z'], graph)
        self.assertEqual(set(order), {'a', 'b', 'z'})
        self.assertLess(order.index('b'), order.index('a'))
