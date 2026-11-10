# Silent full crawl — Task Scheduler (Mon/Wed) or manual.
# Logs: logs\crawl-YYYYMMDD.log
# Crawls every tracked shop so cloud gaps (and flaky CI shops) still refresh weekly.
#
# Boot catch-up (StartWhenAvailable) must not fight the desktop. We wait until the
# machine has been up for a while, then run at Idle priority so browsing stays usable.

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$date    = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $logDir "crawl-$date.log"

function Write-CrawlLog([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    $line | Tee-Object -FilePath $logFile -Append
}

function Get-UptimeMinutes {
    $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    return [math]::Floor(((Get-Date) - $boot).TotalMinutes)
}

# Never launch Chrome in the first minutes after boot/login. Override with
# CRAWL_BOOT_GRACE_MINUTES=0 only when debugging a catch-up run by hand.
$graceMinutes = 20
if ($env:CRAWL_BOOT_GRACE_MINUTES -match '^\d+$') {
    $graceMinutes = [int]$env:CRAWL_BOOT_GRACE_MINUTES
}

$uptime = Get-UptimeMinutes
if ($uptime -lt $graceMinutes) {
    $waitSeconds = [math]::Max(60, ($graceMinutes - $uptime) * 60)
    Write-CrawlLog "Boot grace: uptime ${uptime}m, waiting ${waitSeconds}s before crawl (need ${graceMinutes}m)."
    Start-Sleep -Seconds $waitSeconds
}

# Children (python → Chrome) inherit this class on Windows.
try {
    (Get-Process -Id $PID).PriorityClass = 'Idle'
    Write-CrawlLog "Process priority set to Idle."
} catch {
    Write-CrawlLog "Could not lower process priority: $($_.Exception.Message)"
}

$env:CRAWL_BROWSER_MODE = 'cdp'
$env:PYTHONUNBUFFERED   = '1'
# Full run: do not set CRAWL_RETAILERS. Override only when debugging one shop.
Remove-Item Env:CRAWL_RETAILERS -ErrorAction SilentlyContinue
Remove-Item Env:CRAWL_SKIP_RETAILERS -ErrorAction SilentlyContinue

Write-CrawlLog "Crawl started"
python "$root\crawler\main.py" 2>&1 | Tee-Object -FilePath $logFile -Append
Write-CrawlLog "Crawl finished (exit $LASTEXITCODE)"

# Keep the last 30 days of logs.
Get-ChildItem $logDir -Filter "crawl-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
