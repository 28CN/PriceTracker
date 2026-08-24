# 后台静默爬虫 — 开机自启或任务计划调用
# 不弹窗口，日志写到 logs\crawl-YYYYMMDD.log
# 爬 Big W / Kmart / Target / Toymate（本地才能过 Akamai / 403）

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$date    = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $logDir "crawl-$date.log"

$env:CRAWL_BROWSER_MODE = 'cdp'
$env:CRAWL_RETAILERS    = 'kmart,target,bigw,toymate'
$env:PYTHONUNBUFFERED   = '1'

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Crawl started" | Tee-Object -FilePath $logFile -Append
python "$root\crawler\main.py" 2>&1 | Tee-Object -FilePath $logFile -Append
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Crawl finished" | Tee-Object -FilePath $logFile -Append

# 只保留最近 30 天的日志
Get-ChildItem $logDir -Filter "crawl-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
