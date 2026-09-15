<#
.SYNOPSIS
    Builds the Coach App and publishes it to the Dev2 environment.

.DESCRIPTION
    One command to go from working tree to a published code app in Dev2.

    The script refuses to push when power.config.json does not describe the
    Dev2 "Coach App". That guard is deliberate: this repo has carried several
    configs pointing at different apps across two environments, and the only
    thing separating a Dev2 push from a production push is which file happens
    to be sitting at power.config.json. A wrong push here overwrites a live
    app, so the target is verified rather than assumed.

.PARAMETER SolutionName
    Dataverse solution to associate the app with. Omitted by default, which
    lets Dataverse use the app's existing solution.

.PARAMETER SkipBuild
    Push whatever is already in ./dist instead of rebuilding.

.EXAMPLE
    .\scripts\push-dev2.ps1
    .\scripts\push-dev2.ps1 -SolutionName "CoachPortal"
    .\scripts\push-dev2.ps1 -SkipBuild
#>

[CmdletBinding()]
param(
    [string] $SolutionName = "",
    [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"

# ---- what this script is allowed to push to -------------------------------
$DEV2_ENVIRONMENT_ID = "5739f44a-0323-ec6a-9e6c-9795cc60af4c"
$DEV2_APP_ID         = "ccf1272c-e2af-4abc-aabd-40a7e611bc24"
$DEV2_APP_NAME       = "Coach App"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step([string] $Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string] $Message) {
    Write-Host "    $Message" -ForegroundColor Green
}

function Fail([string] $Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 1. Locate pac
#
# Resolved explicitly rather than trusting the name on PATH. An unrelated npm
# package also publishes a "pac" command and used to shadow this one here, so
# the .dotnet tools path is checked first and the resolved binary is reported.
# ---------------------------------------------------------------------------
Write-Step "Locating Power Platform CLI"

$pac = Join-Path $env:USERPROFILE ".dotnet\tools\pac.exe"

if (-not (Test-Path $pac)) {
    $onPath = Get-Command pac -ErrorAction SilentlyContinue
    if ($onPath) {
        $pac = $onPath.Source
    } else {
        Fail @"
Power Platform CLI not found.

Install it with:
    winget install --id Microsoft.DotNet.SDK.10
    dotnet tool install --global Microsoft.PowerApps.CLI.Tool
"@
    }
}

Write-Ok "pac: $pac"

# ---------------------------------------------------------------------------
# 2. Verify the config targets Dev2
# ---------------------------------------------------------------------------
Write-Step "Verifying push target"

if (-not (Test-Path "power.config.json")) {
    Fail "power.config.json not found in $repoRoot."
}

$config = Get-Content "power.config.json" -Raw | ConvertFrom-Json

Write-Host "    app:         $($config.appDisplayName)"
Write-Host "    appId:       $($config.appId)"
Write-Host "    environment: $($config.environmentId)"

if ($config.environmentId -ne $DEV2_ENVIRONMENT_ID) {
    Fail @"
power.config.json points at environment $($config.environmentId),
but this script only pushes to Dev2 ($DEV2_ENVIRONMENT_ID).

Refusing to push so a Dev2 deploy cannot silently land somewhere else.
"@
}

if ($config.appId -ne $DEV2_APP_ID) {
    Fail @"
power.config.json points at app $($config.appId) ("$($config.appDisplayName)"),
but this script expects the Dev2 "$DEV2_APP_NAME" ($DEV2_APP_ID).

Refusing to push so a different app cannot be overwritten.
"@
}

Write-Ok "Target confirmed: $DEV2_APP_NAME in Dev2"

# ---------------------------------------------------------------------------
# 3. Authentication
#
# `pac auth create` opens a browser sign-in, so it cannot be run unattended —
# the script checks for an existing profile and only prompts when one is
# genuinely missing.
# ---------------------------------------------------------------------------
Write-Step "Checking authentication"

$authList = & $pac auth list 2>&1 | Out-String

if ($authList -match "No profiles were found") {

    Write-Host "    No auth profile found. A browser sign-in will open." -ForegroundColor Yellow

    & $pac auth create --environment $DEV2_ENVIRONMENT_ID
    if ($LASTEXITCODE -ne 0) { Fail "pac auth create failed." }

    Write-Ok "Signed in."

} else {
    Write-Ok "Existing auth profile found."
    Write-Host $authList
}

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
if ($SkipBuild) {

    Write-Step "Skipping build (-SkipBuild)"

    if (-not (Test-Path "dist\index.html")) {
        Fail "-SkipBuild was passed but .\dist\index.html does not exist. Run without -SkipBuild."
    }

    Write-Ok "Using existing .\dist"

} else {

    Write-Step "Building"

    npm run build
    if ($LASTEXITCODE -ne 0) { Fail "Build failed - not pushing." }

    Write-Ok "Build succeeded."
}

# ---------------------------------------------------------------------------
# 5. Push
# ---------------------------------------------------------------------------
Write-Step "Publishing to Dev2"

$pushArgs = @("code", "push", "--environment", $DEV2_ENVIRONMENT_ID)

if ($SolutionName -ne "") {
    $pushArgs += @("--solutionName", $SolutionName)
    Write-Host "    solution: $SolutionName"
}

& $pac @pushArgs
if ($LASTEXITCODE -ne 0) { Fail "pac code push failed." }

Write-Host ""
Write-Host "Published '$DEV2_APP_NAME' to Dev2." -ForegroundColor Green
Write-Host "https://apps.powerapps.com/play/e/$DEV2_ENVIRONMENT_ID/app/$DEV2_APP_ID" -ForegroundColor Green
Write-Host ""
