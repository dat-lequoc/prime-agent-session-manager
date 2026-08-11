# Prime Agent Session Manager - Windows Installer
# Usage: .\install.ps1 [-Mode <cli|gui|default>] [-Prefix <path>]
#        gh api -H "Accept: application/vnd.github.raw+json" repos/dat-lequoc/prime-agent-session-manager/contents/scripts/install.ps1 | iex

param(
    [ValidateSet("cli", "gui", "default")]
    [string]$Mode = "default",

    [string]$Prefix = "$env:LOCALAPPDATA\PrimeAgentSessionManager",

    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$Repo = "dat-lequoc/prime-agent-session-manager"
$ApiUrl = "https://api.github.com/repos/$Repo"

# ─────────────────────────────────────────────────────────────────────────────
# Output Helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Info($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ─────────────────────────────────────────────────────────────────────────────
# Help
# ─────────────────────────────────────────────────────────────────────────────

if ($Help) {
    @"
Prime Agent Session Manager Installer for Windows

USAGE:
    .\install.ps1 [OPTIONS]

OPTIONS:
    -Mode    Installation mode: cli, gui, or default (both)
    -Prefix  Installation directory (default: %LOCALAPPDATA%\PrimeAgentSessionManager)
    -Help    Show this help message

EXAMPLES:
    # Install both CLI and GUI
    .\install.ps1

    # Install CLI only
    .\install.ps1 -Mode cli

    # Install to custom location
    .\install.ps1 -Prefix C:\Tools
"@ | Write-Host
    exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Platform Detection
# ─────────────────────────────────────────────────────────────────────────────

function Get-Platform {
    $arch = $env:PROCESSOR_ARCHITECTURE

    switch ($arch) {
        "AMD64" { return "windows-x64" }
        "ARM64" { return "windows-arm64" }
        default { return "unsupported" }
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# GitHub API Helpers
# ─────────────────────────────────────────────────────────────────────────────

function Test-GitHubCliAuth {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { return $false }
    & gh auth token *> $null
    return $LASTEXITCODE -eq 0
}

function Get-LatestVersion {
    if (Test-GitHubCliAuth) {
        $tag = & gh release view --repo $Repo --json tagName --jq .tagName 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($tag)) {
            return $tag.Trim()
        }
    }

    $response = Invoke-RestMethod -Uri "$ApiUrl/releases/latest" -UseBasicParsing
    return $response.tag_name
}

function Save-ReleaseAsset {
    param($Version, $AssetName, $OutputPath)

    if (Test-GitHubCliAuth) {
        $outputDir = Split-Path -Parent $OutputPath
        & gh release download $Version --repo $Repo --pattern $AssetName --dir $outputDir --clobber
        if ($LASTEXITCODE -ne 0) { throw "Failed to download $AssetName" }
        return
    }

    $downloadUrl = "https://github.com/$Repo/releases/download/$Version/$AssetName"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $OutputPath -UseBasicParsing
}

# ─────────────────────────────────────────────────────────────────────────────
# Download & Install
# ─────────────────────────────────────────────────────────────────────────────

function Install-Cli {
    param($Version, $Platform, $InstallDir)

    $binaryName = "pi-session-cli-$Platform.exe"
    $tmpdir = New-TemporaryFile | ForEach-Object { $_.DirectoryName }
    $tmpFile = Join-Path $tmpdir $binaryName

    Write-Info "Downloading CLI $Version for $Platform..."

    try {
        Save-ReleaseAsset -Version $Version -AssetName $binaryName -OutputPath $tmpFile
    } catch {
        Write-Error "Failed to download $binaryName"
        return
    }

    # Verify checksum if available
    try {
        $shaFile = "$tmpFile.sha256"
        Save-ReleaseAsset -Version $Version -AssetName "${binaryName}.sha256" -OutputPath $shaFile
        $expected = ((Get-Content -Path $shaFile -Raw) -split "\s+")[0].Trim().ToLower()
        $actual = (Get-FileHash $tmpFile -Algorithm SHA256).Hash.ToLower()

        if ($expected -ne $actual) {
            Write-Error "Checksum mismatch!"
            Write-Error "  Expected: $expected"
            Write-Error "  Actual:   $actual"
            return
        }
        Write-Ok "Checksum verified"
    } catch {
        Write-Warn "No checksum available, skipping verification"
    }

    # Ensure install directory exists
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $targetPath = Join-Path $InstallDir "pi-session-cli.exe"
    Move-Item -Path $tmpFile -Destination $targetPath -Force

    Write-Ok "CLI installed to $targetPath"

    # Add to PATH if not already present
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$InstallDir*") {
        Write-Info "Adding $InstallDir to PATH..."
        [Environment]::SetEnvironmentVariable("PATH", "$userPath;$InstallDir", "User")
        Write-Ok "Added to PATH (restart terminal to use)"
    }
}

function Install-Gui {
    param($Version, $Platform, $InstallDir)

    # Tauri NSIS naming: Prime.Agent.Session.Manager_{version}_x64-setup.exe
    $setupName = "Prime.Agent.Session.Manager_$($Version -replace '^v','')_x64-setup.exe"
    $tmpdir = New-TemporaryFile | ForEach-Object { $_.DirectoryName }
    $tmpFile = Join-Path $tmpdir $setupName

    Write-Info "Downloading GUI $Version for Windows..."

    try {
        Save-ReleaseAsset -Version $Version -AssetName $setupName -OutputPath $tmpFile
    } catch {
        Write-Warn "Failed to download installer automatically"
        Write-Info "Please download manually from: https://github.com/$Repo/releases/tag/$Version"
        return
    }

    Write-Info "Installer downloaded to: $tmpFile"
    Write-Info "Running installer... (you may see a UAC prompt)"

    try {
        # Run NSIS installer with /S for silent, but show UI for better UX
        $process = Start-Process -FilePath $tmpFile `
            -ArgumentList "/S" `
            -Wait -PassThru

        if ($process.ExitCode -eq 0) {
            Write-Ok "GUI installed successfully"
        } else {
            Write-Warn "Installation may have failed (exit code: $($process.ExitCode))"
            Write-Info "You can install manually: $tmpFile"
        }
    } catch {
        Write-Warn "Failed to run installer"
        Write-Info "You can install manually: $tmpFile"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

Write-Info "Prime Agent Session Manager Installer"
Write-Host ""

$platform = Get-Platform

if ($platform -eq "unsupported") {
    Write-Error "Unsupported platform: $env:PROCESSOR_ARCHITECTURE"
    exit 1
}

Write-Info "Detected platform: $platform"
Write-Host ""

$version = Get-LatestVersion
Write-Info "Latest version: $version"
Write-Host ""

switch ($Mode) {
    "cli" {
        Write-Info "Installing CLI only..."
        Install-Cli -Version $version -Platform $platform -InstallDir $Prefix
    }
    "gui" {
        Write-Info "Installing GUI only..."
        Install-Gui -Version $version -Platform $platform -InstallDir $Prefix
    }
    "default" {
        Write-Info "Installing both CLI and GUI..."
        Install-Cli -Version $version -Platform $platform -InstallDir $Prefix
        Install-Gui -Version $version -Platform $platform -InstallDir $Prefix
    }
}

Write-Host ""
Write-Ok "Installation complete!"
Write-Host ""

if ($Mode -eq "cli" -or $Mode -eq "default") {
    Write-Host "CLI Quick Start:"
    Write-Host "  pi-session-cli"
    Write-Host "  # Open http://localhost:52131 in your browser"
    Write-Host ""
}

if ($Mode -eq "gui" -or $Mode -eq "default") {
    Write-Host "GUI: Download .msi from releases page for desktop installation"
    Write-Host ""
}
