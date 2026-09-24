# Silent full crawl — Task Scheduler (Mon/Wed) or manual.
# Logs: logs\crawl-YYYYMMDD.log
# Crawls every tracked shop so cloud gaps (and flaky CI shops) still refresh weekly.

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$date    = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $logDir "crawl-$date.log"

$env:CRAWL_BROWSER_MODE = 'cdp'
$env:PYTHONUNBUFFERED   = '1'
# Full run: do not set CRAWL_RETAILERS. Override only when debugging one shop.
Remove-Item Env:CRAWL_RETAILERS -ErrorAction SilentlyContinue
Remove-Item Env:CRAWL_SKIP_RETAILERS -ErrorAction SilentlyContinue

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Crawl started" | Tee-Object -FilePath $logFile -Append
python "$root\crawler\main.py" 2>&1 | Tee-Object -FilePath $logFile -Append
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Crawl finished" | Tee-Object -FilePath $logFile -Append

# 只保留最近 30 天的日志
Get-ChildItem $logDir -Filter "crawl-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
