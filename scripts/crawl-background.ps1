# Silent full crawl — Task Scheduler (Mon/Wed) or manual.
# Logs: logs\crawl-YYYYMMDD.log
# Crawls every tracked shop so cloud gaps (and flaky CI shops) still refresh weekly.
#
# Boot catch-up (StartWhenAvailable) must not fight the desktop. We wait until the
# machine has been up for a while, then run at Idle priority so browsing stays usable.
#
# Important: Playwright-for-Python ships its own node.exe driver. A crawl therefore
# shows Node in Task Manager even when Cursor is closed. That is not Next.js unless
# the command line literally ends in next\dist\server\lib\start-server.js.

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$date    = Get-Date -Format "yyyyMMdd"
$logFile = Join-Path $logDir "crawl-$date.log"

function Write-CrawlLog([string]$Message) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    $line | Tee-Object -FilePath $logFile -Append | Out-Null
}

function Get-UptimeMinutes {
    $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    return [math]::Floor(((Get-Date) - $boot).TotalMinutes)
}

function Write-NodeInventory([string]$Label) {
    Write-CrawlLog "Node inventory ($Label):"
    $rows = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    if (-not $rows) {
        Write-CrawlLog "  (no node.exe)"
        return
    }
    foreach ($row in $rows) {
        $ws = 0
        try {
            $ws = [math]::Round((Get-Process -Id $row.ProcessId -ErrorAction Stop).WorkingSet64 / 1MB)
        } catch { }
        $cmd = if ($row.CommandLine) { ($row.CommandLine -replace '\s+', ' ').Trim() } else { '(no command line)' }
        if ($cmd.Length -gt 260) { $cmd = $cmd.Substring(0, 260) + '...' }
        Write-CrawlLog "  pid=$($row.ProcessId) wsMB=$ws cmd=$cmd"
    }
}

function Get-ProcessTreeIds([int]$RootId) {
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    $pending = New-Object 'System.Collections.Generic.Queue[int]'
    [void]$ids.Add($RootId)
    $pending.Enqueue($RootId)
    $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        foreach ($child in $procs) {
            if ([int]$child.ParentProcessId -eq $current -and -not $ids.Contains([int]$child.ProcessId)) {
                [void]$ids.Add([int]$child.ProcessId)
                $pending.Enqueue([int]$child.ProcessId)
            }
        }
    }
    return @($ids)
}

function Set-IdlePriority([int[]]$ProcessIds) {
    foreach ($id in $ProcessIds) {
        try {
            $proc = Get-Process -Id $id -ErrorAction Stop
            if ($proc.PriorityClass -ne 'Idle') {
                $proc.PriorityClass = 'Idle'
            }
        } catch { }
    }
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

try {
    (Get-Process -Id $PID).PriorityClass = 'Idle'
    Write-CrawlLog "Process priority set to Idle."
} catch {
    Write-CrawlLog "Could not lower process priority: $($_.Exception.Message)"
}

$env:CRAWL_BROWSER_MODE = 'cdp'
$env:PYTHONUNBUFFERED   = '1'
Remove-Item Env:CRAWL_RETAILERS -ErrorAction SilentlyContinue
Remove-Item Env:CRAWL_SKIP_RETAILERS -ErrorAction SilentlyContinue

Write-NodeInventory 'before crawl'
Write-CrawlLog "Crawl started"

$python = $null
foreach ($candidate in @(
    (Get-Command py -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
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
    Write-CrawlLog "ERROR: Python was not found."
    exit 1
}

$stdoutFile = Join-Path $logDir "crawl-$date.stdout.log"
$stderrFile = Join-Path $logDir "crawl-$date.stderr.log"
$proc = Start-Process -FilePath $python `
    -ArgumentList @("$root\crawler\main.py") `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile

try { $proc.PriorityClass = 'Idle' } catch { }

$watchStop = $false
$watch = [powershell]::Create().AddScript({
    param($PythonId, $LogFile, $StopFlagFile)
    function Write-Line([string]$Message) {
        $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
        Add-Content -Path $LogFile -Value $line
    }
    $loggedDriver = $false
    while (-not (Test-Path $StopFlagFile)) {
        if (-not (Get-Process -Id $PythonId -ErrorAction SilentlyContinue)) { break }
        $ids = New-Object 'System.Collections.Generic.HashSet[int]'
        $pending = New-Object 'System.Collections.Generic.Queue[int]'
        [void]$ids.Add([int]$PythonId)
        $pending.Enqueue([int]$PythonId)
        $procs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
        while ($pending.Count -gt 0) {
            $current = $pending.Dequeue()
            foreach ($child in $procs) {
                if ([int]$child.ParentProcessId -eq $current -and -not $ids.Contains([int]$child.ProcessId)) {
                    [void]$ids.Add([int]$child.ProcessId)
                    $pending.Enqueue([int]$child.ProcessId)
                }
            }
        }
        foreach ($row in $procs) {
            if ($row.Name -ne 'node.exe') { continue }
            $cmd = [string]$row.CommandLine
            if ($cmd -match 'playwright\\driver|PriceTracker|pricetracker') {
                [void]$ids.Add([int]$row.ProcessId)
                if (-not $loggedDriver) {
                    $short = ($cmd -replace '\s+', ' ').Trim()
                    if ($short.Length -gt 260) { $short = $short.Substring(0, 260) + '...' }
                    Write-Line "Playwright/node driver: pid=$($row.ProcessId) cmd=$short"
                    $loggedDriver = $true
                }
            }
        }
        foreach ($id in $ids) {
            try {
                $p = Get-Process -Id $id -ErrorAction Stop
                if ($p.PriorityClass -ne 'Idle') { $p.PriorityClass = 'Idle' }
            } catch { }
        }
        Start-Sleep -Seconds 15
    }
}).AddArgument($proc.Id).AddArgument($logFile).AddArgument((Join-Path $logDir "crawl-$date.watch.stop"))

$stopFlag = Join-Path $logDir "crawl-$date.watch.stop"
Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
$watchHandle = $watch.BeginInvoke()

try {
    Wait-Process -Id $proc.Id
} finally {
    Set-Content -Path $stopFlag -Value 'stop'
    try { $watch.EndInvoke($watchHandle) } catch { }
    $watch.Dispose()
    Remove-Item $stopFlag -Force -ErrorAction SilentlyContinue
}

if (Test-Path $stdoutFile) {
    Get-Content $stdoutFile -ErrorAction SilentlyContinue | Tee-Object -FilePath $logFile -Append | Out-Null
}
if (Test-Path $stderrFile) {
    Get-Content $stderrFile -ErrorAction SilentlyContinue | Tee-Object -FilePath $logFile -Append | Out-Null
}
Remove-Item $stdoutFile, $stderrFile -Force -ErrorAction SilentlyContinue

Write-NodeInventory 'after crawl'
Write-CrawlLog "Crawl finished (exit $($proc.ExitCode))"

Get-ChildItem $logDir -Filter "crawl-*.log" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
Get-ChildItem $logDir -Filter "crawl-*.watch.stop" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
