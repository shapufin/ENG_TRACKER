// One-shot: generate a Playwright storageState JSON for the admin role
// so designlang can crawl authenticated pages. Uses the same Django-shell
// token pregeneration as scrape-screenshots.mjs.
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO_ROOT, "design-audit", "storage-state-admin.json");

const pyScript = `
import json, os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
User = get_user_model()
user = User.objects.get(username='admin')
refresh = RefreshToken.for_user(user)
profile = getattr(user, 'profile', None)
user_data = {
    'id': user.id, 'username': user.username, 'email': user.email,
    'first_name': user.first_name, 'last_name': user.last_name,
    'is_staff': user.is_staff, 'is_superuser': user.is_superuser,
}
if profile:
    user_data['albanian_tl_id'] = getattr(profile, 'albanian_tl_id', None)
    user_data['italian_tl_id'] = getattr(profile, 'italian_tl_id', None)
    user_data['is_italian_tl_role'] = bool(getattr(profile, 'is_italian_tl', False))
    user_data['is_albanian_tl_role'] = bool(getattr(profile, 'is_albanian_tl', False))
    user_data['is_team_leader'] = bool(getattr(profile, 'is_team_leader', False))
    user_data['is_hr'] = bool(getattr(profile, 'is_hr', False))
    hire_date = getattr(profile, 'hire_date', None)
    user_data['hire_date'] = str(hire_date) if hire_date else None
    primary_team = getattr(profile, 'team', None)
    if primary_team:
        user_data['team'] = {'id': primary_team.id, 'name': primary_team.name,
            'code': primary_team.code, 'calendar_group': primary_team.calendar_group}
    user_data['teams'] = [{'id': t.id, 'name': t.name, 'code': t.code,
        'calendar_group': t.calendar_group} for t in profile.teams.all()]
    user_data['techs'] = [{'id': t.id, 'name': t.name, 'code': t.code}
        for t in profile.techs.filter(is_active=True).order_by('name')]
    user_data['client_ids'] = list(profile.clients.values_list('id', flat=True))
    user_data['roles'] = sorted(getattr(profile, 'role_codes', []) or [])
from core.mixins.permissions import is_cr_admin
user_data['is_cr_admin'] = is_cr_admin(user)
try:
    from plugins.control_room.services.scope_service import get_access_for_user
    user_data['has_control_room_access'] = bool(get_access_for_user(user))
except Exception:
    user_data['has_control_room_access'] = False
print(json.dumps({'access': str(refresh.access_token), 'refresh': str(refresh), 'user': user_data}))
`;

const tmpPy = path.join(REPO_ROOT, "design-audit", ".gen_tokens.py");
writeFileSync(tmpPy, pyScript, "utf-8");
try {
  const out = execSync(`python "${tmpPy}"`, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  });
  // Find the JSON line (last line that starts with {)
  const lines = out.trim().split("\n");
  const jsonLine = lines.filter((l) => l.trim().startsWith("{")).pop();
  if (!jsonLine) throw new Error("No JSON in output:\n" + out.slice(-400));
  const tokens = JSON.parse(jsonLine);

  const storageState = {
    cookies: [
      {
        name: "refresh_token",
        value: tokens.refresh,
        domain: "127.0.0.1",
        path: "/api/auth/token/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
        expires: -1,
      },
    ],
    origins: [
      {
        origin: "http://127.0.0.1:5173",
        localStorage: [
          { name: "user", value: JSON.stringify(tokens.user) },
          { name: "theme", value: "dark" },
        ],
      },
    ],
  };
  writeFileSync(OUT, JSON.stringify(storageState, null, 2), "utf-8");
  console.log("storageState written to:", OUT);
  console.log("user:", tokens.user.username, "| roles:", tokens.user.roles?.join(",") || "(none)");
} finally {
  if (existsSync(tmpPy)) unlinkSync(tmpPy);
}
