<#
.SYNOPSIS
  Fast test runner for Engineering Tracker.

.DESCRIPTION
  Uses optimized test settings (fast hasher, in-memory DB) automatically.
  The settings.py file detects 'test' in sys.argv and applies optimizations.

.EXAMPLE
  .\scripts\test.ps1                    # Full backend suite (~30s)
  .\scripts\test.ps1 apps.users         # Only users app (~5s)
  .\scripts\test.ps1 apps.users.tests_app.test_tech  # Only tech tests (~2s)
  .\scripts\test.ps1 --parallel 4       # Full suite with 4 workers (~25s)
  .\scripts\test.ps1 frontend           # Frontend suite (~80s)
  .\scripts\test.ps1 lint               # Lint + typecheck only

.NOTES
  Backend:  334 tests in ~30s (was 636s before optimization)
  Frontend: 1188 tests in ~80s
#>

param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Args -contains "frontend") {
    Write-Host "Running frontend tests..." -ForegroundColor Cyan
    Push-Location "$repoRoot\frontend"
    npx vitest run
    $exitCode = $LASTEXITCODE
    Pop-Location
    exit $exitCode
}

if ($Args -contains "lint") {
    Write-Host "Running lint + typecheck..." -ForegroundColor Cyan
    Push-Location "$repoRoot\frontend"
    npm run lint
    npm run build
    Pop-Location
    ruff check apps plugins core config
    exit $LASTEXITCODE
}

Write-Host "Running backend tests..." -ForegroundColor Cyan
Set-Location $repoRoot
python manage.py test @Args --verbosity=1
exit $LASTEXITCODE
