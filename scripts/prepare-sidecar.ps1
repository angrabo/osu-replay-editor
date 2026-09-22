param([ValidateSet('Debug', 'Release')][string]$Configuration = 'Debug')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hostLine = (& rustc -vV | Select-String '^host: ').ToString()
$targetTriple = $hostLine.Substring(6).Trim()
if ($targetTriple -ne 'x86_64-pc-windows-msvc') {
    throw "Unsupported sidecar target: $targetTriple"
}
$outputPath = Join-Path $projectRoot ".build/sidecar/$Configuration"
$projectPath = Join-Path $projectRoot 'engine/ReplayEditor.Engine/ReplayEditor.Engine.csproj'
dotnet publish $projectPath -c $Configuration -r win-x64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -p:UseSharedCompilation=false -m:1 -o $outputPath
if ($LASTEXITCODE -ne 0) { throw 'Sidecar publish failed.' }
$source = Join-Path $outputPath 'ReplayEditor.Engine.exe'
$binaryDirectory = Join-Path $projectRoot 'apps/desktop/src-tauri/binaries'
New-Item -ItemType Directory -Force -Path $binaryDirectory | Out-Null
$destination = Join-Path $binaryDirectory "replay-editor-sidecar-$targetTriple.exe"
Copy-Item -LiteralPath $source -Destination $destination -Force
Write-Host "Prepared $destination"
