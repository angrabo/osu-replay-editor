param(
    [Parameter(Mandatory = $true)][string]$Version,
    [switch]$Push
)
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must be like 1.2.3, got '$Version'."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

if ((git status --porcelain) -and -not $Push) {
    Write-Warning 'Working tree has uncommitted changes; they will be included in the release commit.'
}

function Set-JsonVersion([string]$Path) {
    $text = Get-Content -LiteralPath $Path -Raw
    $updated = $text -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`""
    if ($updated -eq $text) { throw "No version field found in $Path" }
    Set-Content -LiteralPath $Path -Value $updated -NoNewline
    Write-Host "Updated $Path"
}

Set-JsonVersion (Join-Path $projectRoot 'package.json')
Set-JsonVersion (Join-Path $projectRoot 'apps/desktop/package.json')
Set-JsonVersion (Join-Path $projectRoot 'apps/desktop/src-tauri/tauri.conf.json')

$appMetaPath = Join-Path $projectRoot 'apps/desktop/src/appMeta.ts'
$appMetaText = Get-Content -LiteralPath $appMetaPath -Raw
$appMetaUpdated = $appMetaText -replace "APP_VERSION = '[^']*'", "APP_VERSION = '$Version'"
if ($appMetaUpdated -eq $appMetaText) { throw "APP_VERSION not found in $appMetaPath" }
Set-Content -LiteralPath $appMetaPath -Value $appMetaUpdated -NoNewline
Write-Host "Updated $appMetaPath"

$tag = "v$Version"
git add package.json apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src/appMeta.ts
git commit -m "release $tag"
if ($LASTEXITCODE -ne 0) { throw 'Commit failed (did the version actually change?).' }
git tag $tag
if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }

if ($Push) {
    git push
    if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }
    git push origin $tag
    if ($LASTEXITCODE -ne 0) { throw 'Tag push failed.' }
    Write-Host "Pushed $tag - check the Actions tab for the release build."
} else {
    Write-Host "Committed and tagged $tag locally. Review with 'git show $tag', then push with:"
    Write-Host "  git push && git push origin $tag"
    Write-Host "or re-run this script with -Push."
}
