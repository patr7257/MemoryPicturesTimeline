# Prompts for a Dokploy API token and stores it at ~\.dokploy\token,
# credential-store style (same idea as ~/.vercel or ~/.config/neonctl).
# Reusable across projects and sessions; re-run to rotate the token.
# PowerShell 5.1 compatible; absolute paths only.

$dir = Join-Path $HOME ".dokploy"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$path = Join-Path $dir "token"

$token = Read-Host "Dokploy API token"
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host "Nothing entered, aborted."; return }

[System.IO.File]::WriteAllText($path, $token.Trim(), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Token saved to $path (length $($token.Trim().Length))."
