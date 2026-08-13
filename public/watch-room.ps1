$ErrorActionPreference = 'Stop'

$roomId = $env:ROOM_ID
$token = $env:TOKEN

if (-not $roomId) {
  Write-Error 'Usage: set $env:ROOM_ID (and optionally $env:TOKEN), then run: iex (irm https://zeroplayer.space/watch-room.ps1)'
  exit 1
}

$url = "https://zeroplayer.space/api/rooms/$roomId/events"
$curlArgs = @('-fsSL', '-N')
if ($token) {
  $curlArgs += @('-H', "Authorization: Bearer $token")
}

$errFile = Join-Path $env:TEMP "zero-player-watch-$PID.err"
try {
  & curl.exe @curlArgs $url 2>$errFile | ForEach-Object {
    if ($_ -notlike 'data:*') {
      return
    }
    $line = $_.Substring(6)
    if (-not $line) {
      return
    }
    Write-Output $line
    if (
      $line.Contains('"ready":true')
      -or $line.Contains('"currentPlayer":"you"')
      -or $line.Contains('"type":"closed"')
      -or $line.Contains('"status":"finished"')
      -or $line.Contains('"status":"aborted"')
    ) {
      exit 0
    }
    if ($line.Contains('"type":"error"')) {
      exit 1
    }
  }

  $code = $LASTEXITCODE
  if ($code -eq 0 -or $code -eq 141) {
    exit 0
  }
  if (Test-Path $errFile) {
    $message = Get-Content $errFile -Raw
    if ($message) {
      [Console]::Error.WriteLine($message.Trim())
    }
  }
  exit $code
}
finally {
  Remove-Item $errFile -ErrorAction SilentlyContinue
}
