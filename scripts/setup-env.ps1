# Creates .env for local dev by prompting for each secret (never passed as
# arguments, never echoed back). Safe to re-run: shows what exists and asks
# before overwriting. PowerShell 5.1 compatible.

$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

$envPath = Join-Path (Get-Location) ".env"
if (Test-Path $envPath) {
    $answer = Read-Host ".env already exists. Overwrite it? (y/N)"
    if ($answer -ne "y") { Write-Host "Aborted, .env untouched."; return }
}

Write-Host ""
Write-Host "Family Memories local .env setup. Paste values at each prompt."
Write-Host "(Input is raw: special characters are safe here.)"
Write-Host ""

$databaseUrl = Read-Host "DATABASE_URL (Neon pooled connection string)"
$familyEmails = Read-Host "FAMILY_EMAILS (comma-separated allowlist)"
$zeptoToken = Read-Host "ZEPTOMAIL_TOKEN (raw Send Mail token, Enter to skip)"
$zeptoFrom = Read-Host "ZEPTOMAIL_FROM (verified From address, Enter to skip)"

# Random 32-byte base64 secret, no external tooling needed.
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)

$content = @"
DATABASE_URL=$databaseUrl
BETTER_AUTH_SECRET=$secret
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
PASSKEY_RP_ID=localhost
PASSKEY_ORIGIN=http://localhost:3000
FAMILY_EMAILS=$familyEmails
ZEPTOMAIL_TOKEN=$zeptoToken
ZEPTOMAIL_FROM=$zeptoFrom
ZEPTOMAIL_BASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
"@

[System.IO.File]::WriteAllText($envPath, $content + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host ".env written (BETTER_AUTH_SECRET generated automatically)."
Write-Host "Next: cd into the repo and run: pnpm db:migrate"
