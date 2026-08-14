# watch-room.ps1 — poll-based room watcher for Zero Player (Windows PowerShell).
#
# Same strategy as watch-room.sh: instead of holding one long-lived SSE
# connection (killed silently by proxies and idle timeouts, no reconnect,
# no timeout), poll `GET /api/rooms/:id/events` with short-lived
# connections. Every request returns the room's current compact snapshot
# immediately, a dropped request is retried with backoff, and --max-time
# guarantees the script can never hang.
#
# Exit codes:
#   0  terminal state reached (room full / your turn / finished / closed)
#   1  error (room missing, bad token, server error event)
#   2  no terminal state within the timeout — re-run to keep watching

$ErrorActionPreference = 'Stop'

$roomId = $env:ROOM_ID
$token = $env:TOKEN
$baseUrl = $env:ZERO_PLAYER_URL
if (-not $baseUrl) { $baseUrl = 'https://zeroplayer.space' }
$timeoutSeconds = 600
if ($env:WATCH_ROOM_TIMEOUT) { $timeoutSeconds = [int]$env:WATCH_ROOM_TIMEOUT }
$intervalSeconds = 3
if ($env:WATCH_ROOM_INTERVAL) { $intervalSeconds = [int]$env:WATCH_ROOM_INTERVAL }
$maxBackoffSeconds = 15

if (-not $roomId) {
  Write-Error 'Usage: set $env:ROOM_ID (and optionally $env:TOKEN), then run: iex (irm https://zeroplayer.space/watch-room.ps1)'
  exit 1
}

$url = "$baseUrl/api/rooms/$roomId/events"
$deadline = (Get-Date).AddSeconds($timeoutSeconds)
$backoff = 1
$lastLine = $null

while ((Get-Date) -lt $deadline) {
  $outFile = Join-Path $env:TEMP "zero-player-watch-$PID.out"
  $errFile = Join-Path $env:TEMP "zero-player-watch-$PID.err"
  $curlArgs = @('-fsSL', '-N', '--connect-timeout', '5', '--max-time', "$intervalSeconds", $url)
  if ($token) {
    $curlArgs = @('-H', "Authorization: Bearer $token") + $curlArgs
  }
  & curl.exe @curlArgs 1>$outFile 2>$errFile
  $rc = $LASTEXITCODE

  $terminal = $false
  $failed = $false
  $sawData = $false
  if (Test-Path $outFile) {
    Get-Content $outFile | ForEach-Object {
      if ($_ -notlike 'data:*') { return }
      $line = $_.Substring(6).TrimStart()
      if (-not $line) { return }
      $sawData = $true
      if ($line.Contains('"type":"error"')) { $failed = $true }
      if (
        $line.Contains('"ready":true')
        -or $line.Contains('"currentPlayer":"you"')
        -or $line.Contains('"type":"closed"')
        -or $line.Contains('"status":"finished"')
        -or $line.Contains('"status":"aborted"')
      ) { $terminal = $true }
      if ($line -ne $lastLine) {
        Write-Output $line
        $lastLine = $line
      }
    }
  }

  if ($failed) {
    if (Test-Path $errFile) {
      $message = Get-Content $errFile -Raw
      if ($message) { [Console]::Error.WriteLine($message.Trim()) }
    }
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue
    exit 1
  }

  if ($terminal) {
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue
    exit 0
  }

  if ($rc -eq 22) {
    # HTTP error (404 room missing, 401 bad/expired token, 5xx): no retry.
    if (Test-Path $errFile) {
      $message = Get-Content $errFile -Raw
      if ($message) { [Console]::Error.WriteLine($message.Trim()) }
    }
    Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue
    exit 1
  }

  Remove-Item $outFile, $errFile -ErrorAction SilentlyContinue

  if (-not $sawData) {
    # Empty capture — transient failure or the window elapsed before the
    # first byte arrived. Back off and retry.
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min($backoff * 2, $maxBackoffSeconds)
  }
}

Write-Output '{"type":"timeout","message":"No terminal room state within the timeout. Re-run the watch command to keep watching."}'
exit 2
