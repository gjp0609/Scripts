param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('notify', 'clear')]
    [string]$Action
)

$payloadText = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($payloadText)) {
    exit 0
}

try {
    $payload = $payloadText | ConvertFrom-Json
} catch {
    exit 0
}

$stateDir = Join-Path $PSScriptRoot 'state'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

$sessionId = [string]$payload.session_id
if ([string]::IsNullOrWhiteSpace($sessionId)) {
    $sessionId = 'unknown'
}
$stateFile = Join-Path $stateDir ($sessionId + '.json')

if ($Action -eq 'clear') {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    exit 0
}

$eventName = [string]$payload.hook_event_name
$cwd = [string]$payload.cwd
$project = Split-Path -Leaf $cwd
if ([string]::IsNullOrWhiteSpace($project)) {
    $project = $cwd
}

$state = [ordered]@{
    session_id = $sessionId
    turn_id = [string]$payload.turn_id
    event = $eventName
    cwd = $cwd
    project = $project
    updated_at = [DateTimeOffset]::Now.ToString('o')
}
$state | ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8

$powershellExe = Join-Path $PSHOME 'powershell.exe'
$toastScript = Join-Path $PSScriptRoot 'CodexHookToast.ps1'
$arguments = @(
    '-NoProfile'
    '-ExecutionPolicy Bypass'
    ('-File "' + $toastScript + '"')
    ('-EventName "' + $eventName.Replace('"', '') + '"')
    ('-Project "' + $project.Replace('"', '') + '"')
)
Start-Process -FilePath $powershellExe -ArgumentList $arguments -WindowStyle Hidden | Out-Null
exit 0
