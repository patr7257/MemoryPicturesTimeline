# Creates or completes .env for local dev. Prompts ONLY for keys that are
# still empty (Enter skips a key and leaves it empty). Values are never
# echoed back or passed as arguments. Safe to re-run any time, e.g. when the
# R2 keys arrive in a later milestone. PowerShell 5.1 compatible.
# Uses absolute paths throughout: .NET file APIs resolve relative paths
# against the process start directory, not the shell's current location.

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$examplePath = Join-Path $repoRoot ".env.example"

# Dev defaults applied when creating .env from scratch.
$defaults = @{
    "BETTER_AUTH_URL"      = "http://localhost:3000"
    "NEXT_PUBLIC_BASE_URL" = "http://localhost:3000"
    "PASSKEY_RP_ID"        = "localhost"
    "PASSKEY_ORIGIN"       = "http://localhost:3000"
}

# Start from the existing .env, else from .env.example's key list.
$values = New-Object System.Collections.Specialized.OrderedDictionary
$sourcePath = $envPath
if (-not (Test-Path $envPath)) { $sourcePath = $examplePath }
foreach ($line in [System.IO.File]::ReadAllLines($sourcePath)) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^([A-Z0-9_]+)=(.*)$') {
        $values[$Matches[1]] = $Matches[2]
    }
}

foreach ($key in $defaults.Keys) {
    if (-not $values.Contains($key) -or [string]::IsNullOrEmpty($values[$key])) {
        $values[$key] = $defaults[$key]
    }
}

# Generate the auth secret once, never prompt for it.
if ([string]::IsNullOrEmpty($values["BETTER_AUTH_SECRET"])) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $values["BETTER_AUTH_SECRET"] = [Convert]::ToBase64String($bytes)
    Write-Host "BETTER_AUTH_SECRET: generated"
}

Write-Host ""
Write-Host "Prompting for empty keys only. Enter skips (leaves empty)."
Write-Host "(Input is raw: special characters are safe here.)"
Write-Host ""

$keys = @($values.Keys)
foreach ($key in $keys) {
    if ([string]::IsNullOrEmpty($values[$key])) {
        $answer = Read-Host "$key (Enter to skip)"
        if (-not [string]::IsNullOrEmpty($answer)) { $values[$key] = $answer.Trim() }
    } else {
        Write-Host ("{0}: already set (length {1})" -f $key, $values[$key].Length)
    }
}

$out = New-Object System.Collections.Generic.List[string]
foreach ($key in $values.Keys) { $out.Add("$key=$($values[$key])") }
[System.IO.File]::WriteAllLines($envPath, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ".env written to $envPath"
