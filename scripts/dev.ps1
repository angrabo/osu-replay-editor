$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot
& (Join-Path $PSScriptRoot 'prepare-sidecar.ps1') -Configuration Debug
if ($LASTEXITCODE -ne 0) { throw 'Sidecar preparation failed.' }
npm run tauri:dev --workspace @ore/desktop
if ($LASTEXITCODE -ne 0) { throw 'Tauri development session failed.' }
