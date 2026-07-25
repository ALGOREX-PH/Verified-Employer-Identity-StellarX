# Deploy the employer-registry contract to Stellar testnet, initialise it with
# the DTI issuer as admin, then write the contract ID into web\.env.local.
#
# Prereqs: Rust + wasm32v1-none target, the Stellar CLI, and a configured
# issuer (run `npm run setup:issuer` in web\ first).
#
# Usage:  .\scripts\deploy.ps1 [identityName]   (default identity: workshop)

param([string]$Identity = "workshop")

$ErrorActionPreference = "Stop"
$Network = "testnet"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Wasm = "target\wasm32v1-none\release\employer_registry.wasm"
$EnvFile = Join-Path $Root "web\.env.local"

Set-Location $Root

# 0. The registry admin is the DTI issuer — created by `npm run setup:issuer`.
if (-not (Test-Path $EnvFile)) {
  throw "web\.env.local not found. Run 'npm run setup:issuer' in web\ first."
}
$IssuerLine = (Get-Content $EnvFile) | Where-Object { $_ -match '^NEXT_PUBLIC_DTI_ISSUER=' } | Select-Object -First 1
if (-not $IssuerLine) {
  throw "NEXT_PUBLIC_DTI_ISSUER missing from web\.env.local. Run 'npm run setup:issuer' in web\ first."
}
$Issuer = $IssuerLine.Split('=')[1].Trim()

# 1. Ensure a funded testnet identity exists (pays the deploy fees)
$keys = stellar keys ls
if ($keys -notcontains $Identity) {
  Write-Host "Creating + funding testnet identity '$Identity'..."
  stellar keys generate $Identity --network $Network --fund
}

# 2. Build the contract to wasm
Write-Host "Building contract..."
stellar contract build

# 3. Deploy to testnet (returns the contract ID, starting with C...)
Write-Host "Deploying to $Network..."
$ContractId = (stellar contract deploy --wasm $Wasm --source-account $Identity --network $Network).Trim()
Write-Host "Deployed contract ID: $ContractId"

# 4. Initialise the registry with the DTI issuer as admin.
# A fresh deploy can never be legitimately AlreadyInitialized - if init fails,
# assume the contract id was front-run/hijacked and abort loudly.
Write-Host "Initialising registry (admin = $Issuer)..."
stellar contract invoke --id $ContractId --source-account $Identity --network $Network -- init --admin $Issuer
if ($LASTEXITCODE -ne 0) {
  throw "Registry init failed - do NOT use this contract id. Re-run the deploy."
}

# 5. Write NEXT_PUBLIC_CONTRACT_ID into web\.env.local
(Get-Content $EnvFile) | Where-Object { $_ -notmatch '^NEXT_PUBLIC_CONTRACT_ID=' } | Set-Content $EnvFile
Add-Content $EnvFile "NEXT_PUBLIC_CONTRACT_ID=$ContractId"
Write-Host ""
Write-Host "Wrote NEXT_PUBLIC_CONTRACT_ID=$ContractId to web\.env.local"
Write-Host "Restart 'npm run dev' to pick up the new contract ID."
