# 以管理员身份运行此脚本来注册定时任务
# 右键 -> 用 PowerShell 运行，或在管理员 PowerShell 里执行

$scriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\crawl-background.ps1"
$pwsh       = "powershell.exe"
$action     = New-ScheduledTaskAction -Execute $pwsh `
                  -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

# 每周一、周三 早上 6:00
# StartWhenAvailable = 错过时开机后补跑一次
$triggerMon = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday    -At "06:00"
$triggerWed = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "06:00"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RunOnlyIfNetworkAvailable `
    -StartWhenAvailable

# 清理旧的开机自启任务（如果之前注册过）
Unregister-ScheduledTask -TaskName "PriceTracker - On Startup" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName "PriceTracker - Weekly" `
    -Action $action -Trigger $triggerMon, $triggerWed `
    -Settings $settings -RunLevel Highest -Force | Out-Null

Write-Host "OK" -ForegroundColor Green
Write-Host "  PriceTracker - Weekly: Mon + Wed 06:00, missed runs catch up on next boot" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log folder: $(Split-Path $PSScriptRoot -Parent)\logs\" -ForegroundColor Gray
