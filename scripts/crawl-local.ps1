# Crawls from this PC, driving a real browser window.
#
# Kmart and Target refuse a browser that Playwright starts, whatever the flags,
# but serve one that was started the ordinary way and is driven over the
# debugging port. That needs a desktop session, so it runs here rather than in
# GitHub Actions.
#
# Prefer double-clicking crawl-local.bat in the repo root (keeps the window open).
# Or from a terminal already in the repo:
#   powershell -ExecutionPolicy Bypass -File scripts\crawl-local.ps1
#
# Fill in .env.local first: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
# A browser window will open and close on its own. Leave it alone while it runs.

$ErrorActionPreference = 'Stop'

# When launched via Win+R or a double-click, keep the window open so errors
# are readable. Skip the pause when already inside an interactive terminal
# that requested -NoPause, or when Task Scheduler runs us.
$script:KeepOpen = -not $env:CRAWL_NO_PAUSE

function Finish([int]$Code = 0) {
    if ($script:KeepOpen) {
        Write-Host ''
        Write-Host 'Press Enter to close...' -ForegroundColor DarkGray
        try { [void][Console]::ReadLine() } catch { Start-Sleep -Seconds 8 }
    }
    exit $Code
}

try {
    $root = Split-Path $PSScriptRoot -Parent
    Set-Location $root
    Write-Host "Repo: $root" -ForegroundColor DarkGray

    # Win+R / Explorer often inherit a thinner PATH than an opened terminal.
    # Prefer the `py` launcher, then python on PATH, then common install dirs.
    $python = $null
    foreach ($candidate in @(
        (Get-Command py -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
        "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        'C:\Python314\python.exe',
        'C:\Python313\python.exe',
        'C:\Python312\python.exe'
    )) {
        if ($candidate -and (Test-Path $candidate)) {
            $python = $candidate
            break
        }
    }

    if (-not $python) {
        Write-Host 'ERROR: Python was not found.' -ForegroundColor Red
        Write-Host 'Install Python 3 and tick "Add python.exe to PATH", then retry.' -ForegroundColor Yellow
        Finish 1
    }

    Write-Host "Python: $python" -ForegroundColor DarkGray

    $envFile = Join-Path $root '.env.local'
    if (-not (Test-Path $envFile)) {
        Write-Host 'ERROR: .env.local is missing in the repo root.' -ForegroundColor Red
        Write-Host 'Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' -ForegroundColor Yellow
        Finish 1
    }

    $env:CRAWL_BROWSER_MODE = 'cdp'
    $env:PYTHONUNBUFFERED = '1'

    # Limit the run to the shops that only work from here, so the scheduled cloud
    # run keeps ownership of the rest. Clear it to crawl everything.
    if (-not $env:CRAWL_RETAILERS) {
        $env:CRAWL_RETAILERS = 'kmart,target,bigw'
    }

    Write-Host "Crawling $($env:CRAWL_RETAILERS) from this machine..." -ForegroundColor Cyan
    Write-Host 'A Chrome or Edge window will open. Leave it alone until this finishes.' -ForegroundColor DarkGray
    Write-Host ''

    & $python (Join-Path $root 'crawler\main.py')
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }

    Write-Host ''
    if ($code -eq 0) {
        Write-Host 'Crawl finished.' -ForegroundColor Green
    } else {
        Write-Host "Crawl exited with code $code." -ForegroundColor Red
    }
    Finish $code
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Finish 1
}
