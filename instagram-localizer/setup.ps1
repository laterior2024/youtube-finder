# Run from any folder. No administrator access or machine-wide policy change.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/windows-common.ps1')
$previousPath = $env:PATH
Push-Location -LiteralPath $PSScriptRoot
try {
    $nodePath = Get-ProjectNode
    $npmPath = Get-ProjectNpm $nodePath
    $env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $previousPath
    & $nodePath (Join-Path $PSScriptRoot 'scripts/verify-package.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Package integrity check failed. Download a fresh package.' }
    Invoke-ProjectNpm $npmPath @('run', 'setup')
    Invoke-ProjectNpm $npmPath @('ci')
    Invoke-ProjectNpm $npmPath @('run', 'verify')
    Write-Host ''
    Write-Host 'SETUP COMPLETE. Edit .env.local with your Supabase public configuration.'
    Write-Host 'Keep existing Supabase/Vercel projects. Do not rerun the initial database SQL.'
    Write-Host 'Then run .\start.ps1. See SETUP_WINDOWS.md for the full guide.'
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    $env:PATH = $previousPath
    Pop-Location
}
