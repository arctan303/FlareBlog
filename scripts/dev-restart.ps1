#Requires -Version 5.1
[CmdletBinding()]
param([switch]$SkipHealthCheck)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $RepoRoot 'logs'
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
function Write-Step($msg) { Write-Host "[blog-dev-restart] $msg" -ForegroundColor Cyan }
function Stop-PortProcess([int]$Port) {
  $conns = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $conns) { return 0 }
  $ids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $ids) {
    Write-Step "port $Port busy by PID $procId, killing process tree..."
    & taskkill /F /T /PID $procId 2>&1 | Out-Null
  }
  return $ids.Count
}
function Wait-TcpPort([string]$Name, [int]$Port, [int]$TimeoutSec = 60) {
  Write-Step "waiting for $Name on port $Port (max ${TimeoutSec}s)"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($result.AsyncWaitHandle.WaitOne(1000) -and $client.Connected) {
        Write-Step "$Name is up on port $Port"
        return $true
      }
    } catch { }
    finally { $client.Close() }
    Start-Sleep -Seconds 1
  }
  Write-Warning "$Name did not open port $Port within ${TimeoutSec}s, check logs: $LogDir"
  return $false
}
Write-Step "=== 1/4 stop existing services ==="
$killed = Stop-PortProcess 8787
$killed += Stop-PortProcess 4321
Start-Sleep -Seconds 1
Write-Step "cleaned existing processes, starting fresh"
Write-Step "=== 2/4 start backend (wrangler dev :8787) ==="
$beLog = Join-Path $LogDir 'backend.log'
$beErr = Join-Path $LogDir 'backend.err.log'
$be = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory (Join-Path $RepoRoot 'worker') -RedirectStandardOutput $beLog -RedirectStandardError $beErr -WindowStyle Hidden -PassThru
Write-Step "backend PID: $($be.Id), log: $beLog"
Write-Step "=== 3/4 start frontend (astro dev :4321) ==="
$feLog = Join-Path $LogDir 'frontend.log'
$feErr = Join-Path $LogDir 'frontend.err.log'
$fe = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx astro dev --port 4321 --host 127.0.0.1' -WorkingDirectory $RepoRoot -RedirectStandardOutput $feLog -RedirectStandardError $feErr -WindowStyle Hidden -PassThru
Write-Step "frontend PID: $($fe.Id), log: $feLog"
Write-Step "=== 4/4 health check ==="
if (-not $SkipHealthCheck) {
  $beOk = Wait-TcpPort 'backend' 8787
  $feOk = Wait-TcpPort 'frontend' 4321
  Write-Step "backend: $(if ($beOk) { 'OK' } else { 'FAILED' })  frontend: $(if ($feOk) { 'OK' } else { 'FAILED' })"
}
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  blog frontend: http://127.0.0.1:4321" -ForegroundColor Green
Write-Host "  blog backend:  http://127.0.0.1:8787" -ForegroundColor Green
Write-Host "  logs:          $LogDir" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
