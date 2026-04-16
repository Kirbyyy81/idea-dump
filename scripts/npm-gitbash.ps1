param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$NpmArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Escape-BashArg([string]$value) {
    if ($null -eq $value) { return "''" }
    return "'" + ($value -replace "'", "'\\''") + "'"
}

function Resolve-GitBashPath {
    if ($env:GIT_BASH -and (Test-Path -LiteralPath $env:GIT_BASH)) {
        return $env:GIT_BASH
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\bash.exe'),
        (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
        (Join-Path $env:ProgramFiles 'Git\usr\bin\bash.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Git\bin\bash.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Git\usr\bin\bash.exe')
    ) | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -Unique

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "Could not find Git Bash. Install Git for Windows, or set GIT_BASH to the full path to bash.exe."
}

if (-not $NpmArgs -or $NpmArgs.Count -eq 0) {
    throw "Usage: scripts/npm-gitbash.ps1 <npm args...>  (example: scripts/npm-gitbash.ps1 run build)"
}

$bash = Resolve-GitBashPath
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repoRootForBash = ($repoRoot -replace '\\', '/')

$escapedArgs = ($NpmArgs | ForEach-Object { Escape-BashArg $_ }) -join ' '
$cmd = "cd $(Escape-BashArg $repoRootForBash) && npm $escapedArgs"

& $bash -lc $cmd
