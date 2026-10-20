param([string]$DraftRoot)
$ErrorActionPreference = 'Stop'
# Run from an extracted export ZIP. Never overwrite or edit an existing draft.
if (Get-Process -Name CapCut -ErrorAction SilentlyContinue) {
    throw 'Close CapCut before installing this draft.'
}
if (-not $DraftRoot) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'CapCut\User Data\Projects\com.lveditor.draft'),
        (Join-Path $env:LOCALAPPDATA 'CapCut\UserData\Projects\com.lveditor.draft')
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Container }
    if (@($candidates).Count -ne 1) {
        throw 'Cannot select a unique CapCut drafts folder. Run with -DraftRoot followed by the folder from CapCut Settings.'
    }
    $DraftRoot = @($candidates)[0]
}
$root = (Resolve-Path -LiteralPath $DraftRoot).Path
if (-not (Test-Path -LiteralPath $root -PathType Container)) { throw 'DraftRoot must be an existing folder.' }
$source = Join-Path $PSScriptRoot 'desktop-draft'
$content = Get-Content -LiteralPath (Join-Path $source 'draft_content.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$meta = Get-Content -LiteralPath (Join-Path $source 'draft_meta_info.json') -Raw -Encoding UTF8 | ConvertFrom-Json
# A fresh id permits repeated imports without replacing any user project.
$draftId = [guid]::NewGuid().ToString().ToUpperInvariant()
$name = 'Instagram_' + $draftId.Substring(0, 8)
$destination = Join-Path $root $name
if (Test-Path -LiteralPath $destination) { throw 'Destination exists; nothing was changed.' }
foreach ($material in $content.materials.videos) {
    $relative = [string]$material.path
    if ($relative -notmatch '^media/[0-9]{3}_(background|text_[0-9]{2})\.png$') { throw 'Unsafe or unsupported media path.' }
    if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw 'A required image is missing; extract the whole ZIP first.' }
}
# All validation precedes creation; only the new folder is written.
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destination 'media') | Out-Null
foreach ($material in $content.materials.videos) {
    $relative = [string]$material.path
    $target = Join-Path $destination $relative
    Copy-Item -LiteralPath (Join-Path $source $relative) -Destination $target -ErrorAction Stop
    $material.path = $target.Replace('\', '/')
}
$content.id = $draftId
$content.name = $name
$content.path = $destination.Replace('\', '/')
$meta.draft_id = $draftId
$meta.draft_name = $name
$meta.draft_fold_path = $destination.Replace('\', '/')
$meta.draft_root_path = $root.Replace('\', '/')
$encoding = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $destination 'draft_content.json'), ($content | ConvertTo-Json -Depth 100), $encoding)
[IO.File]::WriteAllText((Join-Path $destination 'draft_meta_info.json'), ($meta | ConvertTo-Json -Depth 100), $encoding)
Write-Output ('Installed experimental draft: ' + $destination)
Write-Output 'Open CapCut and check the draft. Compatibility is not verified. Mobile: use photos/text files or CapCut cloud sync.'
