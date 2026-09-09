# Project Instructions

## Restructuring — 2026-09-08

Reduced AGENTS.md from 1,346 lines (92.7 KB) to 78 lines (3.8 KB) per
external review guidance. Historical session outcomes moved to
`.devin/tracking/agents-archive-2026-09.md`. Trace-mcp details moved to
`.devin/context/trace-mcp.md`. Current baselines moved to
`.devin/tracking/current-state.md`. Router `.devin/rules/CONTEXT.md` updated
to reference the new structure.

## Scope
- Read relevant existing code before editing.
- Keep changes limited to the requested scope.
- Preserve existing API contracts unless a breaking change is explicitly requested.
- Do not modify generated files, secrets, production configuration, or unrelated work.
- Never commit or push unless explicitly requested.

## Repository
- Backend: Django/Python.
- Frontend: React/TypeScript.
- Backend source and apps: `apps/`
- Frontend source: `frontend/src/`
- Backend tests: Django/Pytest tests near the relevant app.
- Frontend tests: `frontend/src/**/*.test.*`
- Plans: `.devin/plans/`
- Domain context: `.devin/context/`
- Historical outcomes: `.devin/tracking/agents-archive-*.md`

## Workflow

The AI workflow uses a small always-on router in `.devin/rules/CONTEXT.md` and
routed domain context under `.devin/context/`. Historical detail lives in
`.devin/tracking/`.

- `.devin/rules/CONTEXT.md` is the always-on router and guardrail file.
- `.devin/context/00-INDEX.md` is the on-demand context index.
- `.devin/context/11-PLAN-CREATION.md` is the senior plan protocol — load it
  when creating or optimizing any implementation plan (zero-hallucination
  research, exact before→after specs, self-correcting gates, agent rules).
- Domain files are loaded only when selected by the router.
- Use targeted verification during iteration and one full verification pass at
  the end. Do not dump full logs, lockfiles, generated bundles, or archives
  into context.
- Record session outcomes as short entries in `.devin/tracking/agents-archive-<date>.md`.
- Never commit or push unless explicitly requested.

### Code Intelligence (trace-mcp)

trace-mcp is wired as an MCP server for both Devin (`.devin/mcp_config.json`)
and Claude Code (`~/.claude.json` + hooks). It indexes the codebase graph
and serves framework-aware cross-stack queries.

- **Use for:** cross-stack impact analysis ("what breaks if I change
  `OvertimeLog`?"), call-graph traversal, type hierarchy, find-usages across
  Django↔React boundaries, `get_task_context` for composite tasks.
- **Do NOT use for:** tasks the `.devin/` router already covers (domain rules,
  invariants, permission checks, plan creation). The router is faster for
  curated context; trace-mcp is for structural/dependency questions.
- **Configuration details:** See `.devin/context/trace-mcp.md` for installation,
  hooks, benchmark notes, and manual reindex instructions.

## Backend Rules

- Enforce authorization server-side.
- Preserve tenant, role, and permission boundaries.
- Use transactions and row locks where required by the domain.
- Create migrations for model changes.
- Run:
  - `python manage.py check`
  - `python manage.py makemigrations --check`
  - relevant Django/Pytest tests
  - Ruff on changed Python files

## Frontend Rules

- Use existing shared UI primitives and semantic design tokens.
- Do not introduce raw colors when an existing token is available.
- Preserve responsive behavior and accessibility.
- Every interactive control must have an accessible name.
- Preserve API query keys and payload contracts unless explicitly changing them.
- Run:
  - targeted Vitest tests
  - TypeScript checking
  - ESLint on changed files
  - Prettier on touched files
  - production build when applicable

## Security

- Never expose secrets, tokens, cookies, or personal data.
- Treat all client-side authorization as presentation only.
- Validate permissions again on the backend.
- Reject invalid uploads and malformed input closed by default.
- Stop and ask before changing authentication, authorization, migrations, or production configuration.

## Completion

- Summarize the implementation.
- List modified files.
- List commands actually executed and their results.
- Clearly identify failed, skipped, or environment-blocked checks.
- Do not claim a test passed unless it was run.

## Workflow Sync Command

When you say "update workflow" or "sync workflow":
1. Compare `.devin/rules/CONTEXT.md` router table with AGENTS.md (root file should stay lean - no router duplication)
2. Update AGENTS.md workflow section if CONTEXT.md workflow changed
3. Update trace-mcp reference if needed
4. Report any changes made to AGENTS.md
