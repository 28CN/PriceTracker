# Run as Administrator to register the weekly local crawl.
# Right-click -> Run with PowerShell, or from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\register-tasks.ps1
#
# The task still catches up after a missed Mon/Wed 06:00 run, but:
#   - only when the PC has been idle for a few minutes
#   - the script itself waits ~20 minutes after boot before opening Chrome
#   - Task Scheduler priority is lowest; the script runs at Idle process priority
# So the first minutes after opening the laptop stay usable.

$scriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\crawl-background.ps1"
$pwsh       = "powershell.exe"
$action     = New-ScheduledTaskAction -Execute $pwsh `
                  -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

# Weekly Mon + Wed 06:00. StartWhenAvailable = catch up after missed runs.
$triggerMon = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday    -At "06:00"
$triggerWed = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "06:00"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RunOnlyIfNetworkAvailable `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -Priority 10 `
    -RunOnlyIfIdle `
    -IdleDuration (New-TimeSpan -Minutes 8) `
    -IdleWaitTimeout (New-TimeSpan -Hours 4) `
    -DontStopOnIdleEnd

# Drop the old on-boot task if it is still around.
Unregister-ScheduledTask -TaskName "PriceTracker - On Startup" -Confirm:$false -ErrorAction SilentlyContinue

try {
    Register-ScheduledTask -TaskName "PriceTracker - Weekly" `
        -Action $action -Trigger $triggerMon, $triggerWed `
        -Settings $settings -RunLevel Highest -Force | Out-Null
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Re-run this script from an elevated PowerShell (Run as administrator)." -ForegroundColor Yellow
    exit 1
}

Write-Host "OK" -ForegroundColor Green
Write-Host "  PriceTracker - Weekly: Mon + Wed 06:00" -ForegroundColor Cyan
Write-Host "  Missed runs catch up only after idle + ~20 min boot grace (see crawl-background.ps1)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log folder: $(Split-Path $PSScriptRoot -Parent)\logs\" -ForegroundColor Gray

