$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot
& (Join-Path $PSScriptRoot 'prepare-sidecar.ps1') -Configuration Release
if ($LASTEXITCODE -ne 0) { throw 'Sidecar preparation failed.' }
npm run tauri:build --workspace @ore/desktop
if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed.' }
