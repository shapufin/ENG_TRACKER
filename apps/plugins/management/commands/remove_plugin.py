"""
Management command to COMPLETELY remove a plugin: data, tables, source
code, frontend pages/components, route registrations, and cross-plugin
references.

WARNING: This is irreversible. A git branch is created first as a safety
net (unless --no-branch is passed).

Steps performed:
 1. Create a git safety branch (unless --no-branch)
 2. Uninstall (drop DB tables + delete Plugin/PluginPermission rows)
 3. Remove backend source code (plugins/<name>/)
 4. Remove frontend plugin code (frontend/src/plugins/<name>/)
 5. Find & remove frontend pages/components matching plugin name
 6. Clean AppRoutes.tsx (import + route entry)
 7. Clean usePluginManagement.ts ADMIN_ROUTE_MAP entry
 8. Clean frontend/src/plugins/index.ts registry entry
 9. Detect cross-plugin Python imports (report, do NOT auto-rewrite)
10. Clean .github/workflows/ci.yml test list entry
11. Clean uploaded media files
12. Remove __pycache__ directories

Usage:
    python manage.py remove_plugin ticket_kpi
    python manage.py remove_plugin ticket_kpi --dry-run
    python manage.py remove_plugin ticket_kpi --force
    python manage.py remove_plugin ticket_kpi --no-branch
    python manage.py remove_plugin ticket_kpi --keep-code
"""

import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from core.plugins.registry import plugin_registry


class Command(BaseCommand):
    help = 'COMPLETELY remove a plugin: data, tables, source code, frontend, routes (IRREVERSIBLE)'

    def add_arguments(self, parser):
        parser.add_argument('plugin_name', type=str, help='Name of the plugin to completely remove')
        parser.add_argument('--force', action='store_true', help='Skip confirmation prompt')
        parser.add_argument('--dry-run', action='store_true', help='Show what would be deleted without deleting')
        parser.add_argument('--keep-code', action='store_true', help='Only uninstall data (tables + media), keep source code')
        parser.add_argument('--no-branch', action='store_true', help='Skip creating a git safety branch')

    def handle(self, *args, **options):
        plugin_name = options['plugin_name']
        force = options['force']
        dry_run = options['dry_run']
        keep_code = options['keep_code']
        no_branch = options['no_branch']

        self.stdout.write(self.style.WARNING('=' * 60))
        self.stdout.write(self.style.WARNING(f'PLUGIN REMOVAL: {plugin_name}'))
        self.stdout.write(self.style.WARNING('=' * 60))

        # Verify plugin exists in registry OR on disk (registry may already
        # have lost it if the dir was partially deleted).
        all_plugins = plugin_registry.get_all_plugins()
        project_root = Path(settings.BASE_DIR)
        backend_dir = project_root / 'plugins' / plugin_name
        if plugin_name not in all_plugins and not backend_dir.exists():
            self.stdout.write(self.style.ERROR(f'Plugin "{plugin_name}" not found in registry or on disk'))
            if all_plugins:
                self.stdout.write(self.style.WARNING(f'Available plugins: {", ".join(all_plugins.keys())}'))
            sys.exit(1)

        # Gather all paths and targets
        targets = self._gather_targets(plugin_name, project_root)

        # Show what will be deleted
        self._print_plan(plugin_name, targets, keep_code, no_branch)

        if dry_run:
            self._print_cross_refs(plugin_name, project_root)
            self.stdout.write(self.style.WARNING('\nDRY RUN: No files were deleted. Run without --dry-run to execute.'))
            return

        # Confirmation
        if not force:
            confirm = input(
                f'\nAre you ABSOLUTELY SURE you want to completely remove "{plugin_name}"?\n'
                f'Type the plugin name "{plugin_name}" to confirm: '
            )
            if confirm != plugin_name:
                self.stdout.write(self.style.WARNING('Removal cancelled'))
                return

        # Step 1: Git safety branch
        if not no_branch:
            self._create_git_branch(plugin_name, project_root)

        # Step 2: Uninstall (drop tables + delete DB rows)
        self.stdout.write('\nStep 2: Uninstalling (dropping tables + cleaning DB rows)...')
        try:
            success = plugin_registry.uninstall_plugin(plugin_name, backup_data=False)
            if success:
                self.stdout.write(self.style.SUCCESS('  [OK] Tables dropped + Plugin/PluginPermission rows deleted'))
            else:
                self.stdout.write(self.style.WARNING('  âš  Uninstall may have partially failed; continuing with code removal'))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  âš  Uninstall error (continuing): {e}'))

        if keep_code:
            self.stdout.write(self.style.WARNING('\n--keep-code: Skipping source code deletion.'))
            self.stdout.write(self.style.SUCCESS(f'\nPlugin "{plugin_name}" data has been removed. Source code preserved.'))
            return

        # Steps 3-4: Remove backend + frontend plugin code
        self._remove_dir(targets['backend_dir'], 'Step 3: Backend source code')
        self._remove_dir(targets['frontend_plugin_dir'], 'Step 4: Frontend plugin code')

        # Step 5: Find & remove frontend pages/components
        self._remove_frontend_files(targets['frontend_files'], 'Step 5: Frontend pages/components')

        # Step 6: Clean AppRoutes.tsx
        self._clean_file(targets['app_routes_file'], plugin_name, 'Step 6: AppRoutes.tsx',
                         self._app_routes_patterns)

        # Step 7: Clean usePluginManagement.ts
        self._clean_file(targets['plugin_mgmt_file'], plugin_name, 'Step 7: usePluginManagement.ts',
                         self._plugin_mgmt_patterns)

        # Step 8: Clean frontend/src/plugins/index.ts
        self._clean_file(targets['registry_file'], plugin_name, 'Step 8: plugins/index.ts',
                         self._registry_patterns)

        # Step 9: Detect cross-plugin references (report only)
        self._print_cross_refs(plugin_name, project_root)

        # Step 10: Clean CI workflow
        self._clean_file(targets['ci_workflow_file'], plugin_name, 'Step 10: .github/workflows/ci.yml',
                         self._ci_workflow_patterns)

        # Step 11: Clean media
        self._remove_dir(targets['media_dir'], 'Step 11: Uploaded media files')

        # Step 12: Remove __pycache__
        self._remove_pycache(targets['pycache_dirs'], 'Step 12: __pycache__ directories')

        # Final summary
        self.stdout.write(self.style.WARNING('\n' + '=' * 60))
        self.stdout.write(self.style.SUCCESS(f'Plugin "{plugin_name}" has been COMPLETELY REMOVED'))
        self.stdout.write(self.style.WARNING('=' * 60))
        self.stdout.write('\nManual steps still required:')
        self.stdout.write('  1. Review cross-plugin references reported above (if any)')
        self.stdout.write('  2. Run: cd frontend && npm run build')
        self.stdout.write('  3. Run: python manage.py test')
        self.stdout.write('  4. Restart the Django server')
        self.stdout.write(f'  5. Review changes on branch, then merge: git merge purge-plugin-{plugin_name}')

    # --- Target gathering ---------------------------------------------â”€â”€

    def _gather_targets(self, plugin_name: str, project_root: Path) -> dict:
        """Gather all paths that may need to be deleted or edited."""
        backend_dir = project_root / 'plugins' / plugin_name
        frontend_plugin_dir = project_root / 'frontend' / 'src' / 'plugins' / plugin_name
        media_dir = Path(settings.MEDIA_ROOT) / 'ticket_imports' if plugin_name == 'ticket_kpi' else None
        pycache_dirs = list(backend_dir.rglob('__pycache__')) if backend_dir.exists() else []

        # Find frontend pages/components matching the plugin name.
        frontend_files = self._find_frontend_files(plugin_name, project_root)

        return {
            'backend_dir': backend_dir,
            'frontend_plugin_dir': frontend_plugin_dir,
            'frontend_files': frontend_files,
            'app_routes_file': project_root / 'frontend' / 'src' / 'components' / 'routing' / 'AppRoutes.tsx',
            'plugin_mgmt_file': project_root / 'frontend' / 'src' / 'hooks' / 'usePluginManagement.ts',
            'registry_file': project_root / 'frontend' / 'src' / 'plugins' / 'index.ts',
            'ci_workflow_file': project_root / '.github' / 'workflows' / 'ci.yml',
            'media_dir': media_dir,
            'pycache_dirs': pycache_dirs,
        }

    def _find_frontend_files(self, plugin_name: str, project_root: Path) -> list:
        """
        Find frontend .tsx/.ts files in pages/admin/ and components/admin/
        whose name matches the plugin name (PascalCase, camelCase, or
        kebab-case variants). Excludes the frontend/src/plugins/<name>/
        directory (handled separately).
        """
        # Convert plugin_name to common filename variants.
        # e.g. "email_notifications" -> ["EmailNotifications", "emailNotifications"]
        #      "budget" -> ["Budget", "budget"]
        #      "ticket_kpi" -> ["TicketKPI", "ticketKPI", "TicketKpi"]
        pascal = ''.join(w.capitalize() for w in plugin_name.split('_'))
        # Handle acronyms: KPI -> KPI (not Kpi)
        upper_acronym = ''.join(w.upper() for w in plugin_name.split('_'))
        camel = pascal[0].lower() + pascal[1:] if pascal else plugin_name

        name_variants = {pascal, camel, upper_acronym, plugin_name}
        # Also try with underscores replaced by hyphens
        name_variants.add(plugin_name.replace('_', '-'))

        search_dirs = [
            project_root / 'frontend' / 'src' / 'pages' / 'admin',
            project_root / 'frontend' / 'src' / 'pages' / 'analytics',
            project_root / 'frontend' / 'src' / 'components' / 'admin',
        ]

        matches = []
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for f in search_dir.rglob('*'):
                if not f.is_file():
                    continue
                if f.suffix not in ('.tsx', '.ts'):
                    continue
                # Match: filename starts with a name variant, or contains it
                # as a word boundary. Conservative -- avoids matching
                # "BudgetStatsCards" when searching for "stats".
                stem = f.stem
                if any(stem.startswith(v) or v in stem for v in name_variants if len(v) >= 3):
                    matches.append(f)
        return matches

    # --- Plan printing ------------------------------------------------â”€â”€

    def _print_plan(self, plugin_name: str, targets: dict, keep_code: bool, no_branch: bool):
        self.stdout.write('\nThe following will be PERMANENTLY DELETED:\n')
        self.stdout.write(f'  1. Git safety branch ({"skipped" if no_branch else "created"})')
        self.stdout.write(f'  2. Database tables + Plugin/PluginPermission rows for: {plugin_name}')
        if targets['backend_dir'].exists():
            self.stdout.write(f'  3. Backend code: {targets["backend_dir"]}')
        else:
            self.stdout.write(f'  3. Backend code: {targets["backend_dir"]} (not found)')
        if targets['frontend_plugin_dir'].exists():
            self.stdout.write(f'  4. Frontend plugin code: {targets["frontend_plugin_dir"]}')
        else:
            self.stdout.write(f'  4. Frontend plugin code: {targets["frontend_plugin_dir"]} (not found)')
        if targets['frontend_files']:
            self.stdout.write(f'  5. Frontend pages/components ({len(targets["frontend_files"])} files):')
            for f in targets['frontend_files']:
                self.stdout.write(f'       - {f.relative_to(Path(settings.BASE_DIR))}')
        else:
            self.stdout.write('  5. Frontend pages/components: (none found by name match)')
        self.stdout.write(f'  6. AppRoutes.tsx: remove import + route for {plugin_name}')
        self.stdout.write('  7. usePluginManagement.ts: remove ADMIN_ROUTE_MAP entry')
        self.stdout.write('  8. plugins/index.ts: remove registry entry')
        self.stdout.write('  9. Cross-plugin imports: detect & report (manual fix)')
        self.stdout.write(' 10. .github/workflows/ci.yml: remove from test list')
        if targets['media_dir'] and targets['media_dir'].exists():
            self.stdout.write(f' 11. Uploaded media files: {targets["media_dir"]}')
        if targets['pycache_dirs']:
            self.stdout.write(f' 12. __pycache__ directories: {len(targets["pycache_dirs"])}')
        if keep_code:
            self.stdout.write(self.style.WARNING('\n  --keep-code: Source code will NOT be deleted (data only)'))

    # --- Execution helpers ---------------------------------------------â”€

    def _create_git_branch(self, plugin_name: str, project_root: Path):
        self.stdout.write('\nStep 1: Creating git safety branch...')
        timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        branch = f'purge-plugin-{plugin_name}-{timestamp}'
        try:
            subprocess.run(
                ['git', 'checkout', '-b', branch],
                cwd=str(project_root), check=True,
                capture_output=True, text=True,
            )
            self.stdout.write(self.style.SUCCESS(f'  [OK] Created branch: {branch}'))
        except subprocess.CalledProcessError as e:
            self.stdout.write(self.style.WARNING(
                f'  âš  Could not create git branch ({e.stderr.strip() or e}). Continuing without safety net.'
            ))

    def _remove_dir(self, path: Path, step_label: str):
        if path is None or not path.exists():
            self.stdout.write(f'{step_label}: (not found, skipping)')
            return
        self.stdout.write(f'{step_label}...')
        try:
            shutil.rmtree(path)
            self.stdout.write(self.style.SUCCESS(f'  [OK] Deleted {path}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  [ERR] Failed: {e}'))

    def _remove_frontend_files(self, files: list, step_label: str):
        self.stdout.write(f'{step_label}...')
        if not files:
            self.stdout.write('  (no files found by name match)')
            return
        for f in files:
            try:
                f.unlink()
                self.stdout.write(self.style.SUCCESS(f'  [OK] Deleted {f.name}'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  [ERR] Failed to delete {f.name}: {e}'))

    def _clean_file(self, path: Path, plugin_name: str, step_label: str, pattern_fn):
        """Apply regex patterns to remove plugin references from a file."""
        self.stdout.write(f'{step_label}...')
        if not path.exists():
            self.stdout.write(f'  âš  File not found: {path}')
            return
        try:
            content = path.read_text(encoding='utf-8')
            patterns = pattern_fn(plugin_name)
            new_content = content
            for pattern in patterns:
                new_content = re.sub(pattern, '', new_content)
            # Clean up any triple+ blank lines left behind
            new_content = re.sub(r'\n{3,}', '\n\n', new_content)
            if new_content != content:
                path.write_text(new_content, encoding='utf-8')
                self.stdout.write(self.style.SUCCESS(f'  [OK] Cleaned {path.name}'))
            else:
                self.stdout.write(f'  âš  No references found in {path.name}')
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  [ERR] Failed: {e}'))

    def _remove_pycache(self, dirs: list, step_label: str):
        self.stdout.write(f'{step_label}...')
        if not dirs:
            self.stdout.write('  (none found)')
            return
        for pycache in dirs:
            try:
                if pycache.exists():
                    shutil.rmtree(pycache)
                    self.stdout.write(self.style.SUCCESS(f'  [OK] Deleted {pycache}'))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'  âš  Could not delete {pycache}: {e}'))

    # --- Cross-plugin reference detection ------------------------------â”€

    def _print_cross_refs(self, plugin_name: str, project_root: Path):
        """Scan .py files for imports of plugins.<name> outside the plugin's
        own directory. Report only -- do NOT auto-rewrite (requires human
        judgment on whether to delete the function, rewrite it, etc.)."""
        self.stdout.write('\nStep 9: Detecting cross-plugin Python imports...')
        import_pattern = re.compile(
            rf'(?:from\s+plugins\.{plugin_name}|import\s+plugins\.{plugin_name})'
        )
        search_dirs = [
            project_root / 'apps',
            project_root / 'core',
            project_root / 'config',
            project_root / 'plugins',
        ]
        refs = []
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for py_file in search_dir.rglob('*.py'):
                # Skip the plugin's own directory (being deleted)
                if str(py_file).startswith(str(project_root / 'plugins' / plugin_name)):
                    continue
                if '__pycache__' in str(py_file):
                    continue
                try:
                    content = py_file.read_text(encoding='utf-8')
                    for i, line in enumerate(content.splitlines(), 1):
                        if import_pattern.search(line):
                            refs.append((py_file.relative_to(project_root), i, line.strip()))
                except Exception:
                    pass
        if not refs:
            self.stdout.write(self.style.SUCCESS('  [OK] No cross-plugin imports found'))
        else:
            self.stdout.write(self.style.WARNING(
                f'  [!] Found {len(refs)} cross-plugin reference(s) -- MANUAL FIX REQUIRED:'
            ))
            for path, lineno, line in refs:
                self.stdout.write(f'       {path}:{lineno}: {line}')
            self.stdout.write(self.style.WARNING(
                '  These imports will break. You must either:\n'
                '    - Remove the import + the code that uses it, OR\n'
                '    - Rewrite the code to not depend on the deleted plugin\n'
                '  This cannot be auto-fixed -- it requires understanding the\n'
                '  calling code\'s semantics.'
            ))

    # --- Regex patterns per file ---------------------------------------â”€

    def _app_routes_patterns(self, plugin_name: str) -> list:
        """Patterns to remove plugin import + route from AppRoutes.tsx."""
        pascal = ''.join(w.capitalize() for w in plugin_name.split('_'))
        return [
            # Import: import { BudgetPage } from "@/pages/admin/BudgetPage";
            rf'import\s+\{{{pascal}\w*Page\}}\s+from\s+"@/pages/admin/{pascal}\w*Page";\n',
            # Route: { path: "/admin/budget", element: withErrorBoundary(<BudgetPage />) },
            # or multi-line route entries
            rf'\s*\{{\s*path:\s*"/admin/{plugin_name.replace("_", "-")}\w*",\s*'
            rf'element:\s*with(?:ErrorBoundary|Suspense)\(\s*<{pascal}\w*Page\s*/>\s*\)\s*\}},?\n',
        ]

    def _plugin_mgmt_patterns(self, plugin_name: str) -> list:
        """Pattern to remove ADMIN_ROUTE_MAP entry from usePluginManagement.ts."""
        return [
            rf'\s*{plugin_name}:\s*"/admin/[^"]+",\n',
        ]

    def _registry_patterns(self, plugin_name: str) -> list:
        """Pattern to remove plugin entry from frontend/src/plugins/index.ts."""
        # Match: 'plugin_name': { ... },
        return [
            rf"\s*'{plugin_name}':\s*\{{[\s\S]*?\}},?\n",
        ]

    def _ci_workflow_patterns(self, plugin_name: str) -> list:
        """Pattern to remove plugin from CI test list."""
        return [
            rf'\s*plugins\.{plugin_name}\s*\\\n',
            rf'\s*plugins\.{plugin_name}\s*\n',
        ]
