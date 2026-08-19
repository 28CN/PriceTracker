# Crawls from this PC, driving a real browser window.
#
# Kmart and Target refuse a browser that Playwright starts, whatever the flags,
# but serve one that was started the ordinary way and is driven over the
# debugging port. That needs a desktop session, so it runs here rather than in
# GitHub Actions.
#
#   powershell -ExecutionPolicy Bypass -File scripts\crawl-local.ps1
#
# Fill in .env.local first: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
# A browser window will open and close on its own. Leave it alone while it runs.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$env:CRAWL_BROWSER_MODE = 'cdp'

# Limit the run to the shops that only work from here, so the scheduled cloud
# run keeps ownership of the rest. Clear it to crawl everything.
if (-not $env:CRAWL_RETAILERS) {
    $env:CRAWL_RETAILERS = 'kmart,target,bigw'
}

Write-Host "Crawling $($env:CRAWL_RETAILERS) from this machine..." -ForegroundColor Cyan
python crawler/main.py
