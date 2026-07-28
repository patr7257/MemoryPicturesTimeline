# Pushes PRODUCTION env vars for the memories app to Dokploy via its API.
# Reads secrets from the local .env (never shown, never passed as arguments)
# and the API token from ~\.dokploy\token (scripts/save-dokploy-token.ps1).
# Production URL values are overridden here; a FRESH BETTER_AUTH_SECRET is
# generated for prod so local and prod sessions never share a secret.
# Re-run any time (e.g. after adding R2 keys); it overwrites the app env.
# PowerShell 5.1 compatible; absolute paths only.

$ErrorActionPreference = "Continue"
$applicationId = "aO-snDweznAl5O7zsPhHc"
$dokployBase = "https://deploy.patrickrobel.dk/api"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env"
$tokenPath = Join-Path $HOME ".dokploy\token"

if (-not (Test-Path $envPath)) { Write-Host "No .env found; run scripts\setup-env.ps1 first."; return }
if (-not (Test-Path $tokenPath)) { Write-Host "No Dokploy token; run scripts\save-dokploy-token.ps1 first."; return }

$local = @{}
foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { $local[$Matches[1]] = $Matches[2] }
}

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$prodSecret = [Convert]::ToBase64String($bytes)

$copyKeys = @("DATABASE_URL", "FAMILY_EMAILS", "ZEPTOMAIL_TOKEN", "ZEPTOMAIL_FROM", "ZEPTOMAIL_BASE_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
$prod = New-Object System.Collections.Generic.List[string]
$prod.Add("BETTER_AUTH_SECRET=$prodSecret")
$prod.Add("BETTER_AUTH_URL=https://memories.patrickrobel.dk")
$prod.Add("NEXT_PUBLIC_BASE_URL=https://memories.patrickrobel.dk")
$prod.Add("PASSKEY_RP_ID=patrickrobel.dk")
$prod.Add("PASSKEY_ORIGIN=https://memories.patrickrobel.dk")
foreach ($k in $copyKeys) {
    $v = ""
    if ($local.ContainsKey($k)) { $v = $local[$k] }
    $prod.Add("$k=$v")
    Write-Host ("{0}: length {1}" -f $k, $v.Length)
}

$token = (Get-Content $tokenPath -Raw).Trim()
$headers = @{ "x-api-key" = $token; "Content-Type" = "application/json" }
$body = @{
    applicationId = $applicationId
    env           = ($prod -join "`n")
    buildArgs     = $null
    buildSecrets  = $null
    createEnvFile = $false
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$dokployBase/application.saveEnvironment" -Headers $headers -Method Post -Body $body -ErrorAction Stop | Out-Null
    Write-Host ""
    Write-Host "Production env pushed to Dokploy app $applicationId."
} catch {
    Write-Host "saveEnvironment FAILED:"
    if ($null -ne $_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host ($reader.ReadToEnd())
    } else {
        Write-Host $_.Exception.Message
    }
}
