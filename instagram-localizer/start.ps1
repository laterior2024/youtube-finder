[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$Port = 5173,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts/windows-common.ps1')
$previousPath = $env:PATH
Push-Location -LiteralPath $PSScriptRoot
try {
    $nodePath = Get-ProjectNode
    $npmPath = Get-ProjectNpm $nodePath
    $env:PATH = (Split-Path -Parent $nodePath) + [IO.Path]::PathSeparator + $previousPath
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules/vite/bin/vite.js') -PathType Leaf)) {
        throw 'Dependencies are missing. Run .\setup.ps1 first.'
    }
    & $nodePath (Join-Path $PSScriptRoot 'scripts/check-env.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Configuration is incomplete. Follow SETUP_WINDOWS.md.' }
    Write-Host ('Open http://127.0.0.1:' + $Port + ' . Press Ctrl+C to stop.')
    $viteArguments = @('run','dev','--','--host','127.0.0.1','--port',"$Port",'--strictPort')
    if (-not $NoBrowser) { $viteArguments += '--open' }
    Invoke-ProjectNpm $npmPath $viteArguments
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    $env:PATH = $previousPath
    Pop-Location
}
