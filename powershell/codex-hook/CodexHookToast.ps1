param(
    [string]$EventName = 'Stop',
    [string]$Project = 'Codex'
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if ($EventName -eq 'PermissionRequest') {
    $title = 'Codex 需要审批'
    $message = "$Project 正在等待执行许可"
    $icon = [System.Windows.Forms.ToolTipIcon]::Warning
} else {
    $title = 'Codex 等待操作'
    $message = "$Project 已完成当前任务"
    $icon = [System.Windows.Forms.ToolTipIcon]::Info
}

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
try {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
    $notifyIcon.Text = if ($title.Length -le 63) { $title } else { $title.Substring(0, 63) }
    $notifyIcon.BalloonTipTitle = $title
    $notifyIcon.BalloonTipText = $message
    $notifyIcon.BalloonTipIcon = $icon
    $notifyIcon.Visible = $true
    $notifyIcon.ShowBalloonTip(10000)
    Start-Sleep -Seconds 12
} finally {
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
}
