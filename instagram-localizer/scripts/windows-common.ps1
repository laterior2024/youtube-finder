Set-StrictMode -Version Latest
function Get-ProjectNode {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Install Node.js 24 LTS from https://nodejs.org/en/download and reopen PowerShell.' }
    $nodePath = $command.Source
    $version = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') {
        throw 'This project requires Node.js 24. Select Node 24, then reopen PowerShell.'
    }
    return $nodePath
}
function Get-ProjectNpm([string]$NodePath) {
    $npmPath = Join-Path (Split-Path -Parent $NodePath) 'npm.cmd'
    if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf)) {
        throw 'npm.cmd was not found beside node.exe. Reinstall Node.js 24 with npm.'
    }
    return $npmPath
}
function Invoke-ProjectNpm([string]$NpmPath, [string[]]$Arguments) {
    & $NpmPath @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('npm failed with exit code ' + $LASTEXITCODE + '. See the output above.') }
}
