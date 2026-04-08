# research-refactor-pipeline.ps1
# Chains all 4 phases of the research system redesign.
# Run from: C:\Users\fosbo\war-civ-v2

$ErrorActionPreference = "Continue"
$logDir = "$PSScriptRoot\docs\refactor-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$phases = @(
    @{ Phase=1; File="$PSScriptRoot\docs\phase1-prompt.md"; Desc="Backend Foundation (Types + Research Data + Core System)" },
    @{ Phase=2; File="$PSScriptRoot\docs\phase2-prompt.md"; Desc="capabilityDoctrine + Sacrifice + Chassis Unlock" },
    @{ Phase=3; File="$PSScriptRoot\docs\phase3-prompt.md"; Desc="AI Strategy + Content Files + Tests" },
    @{ Phase=4; File="$PSScriptRoot\docs\phase4-prompt.md"; Desc="Frontend (Research Tree UI + View Model + GameSession)" }
)

foreach ($p in $phases) {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $logFile = "$logDir\phase$($p.Phase)_$timestamp.log"
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  PHASE $($p.Phase) : $($p.Desc)" -ForegroundColor Cyan
    Write-Host "  Started: $(Get-Date)" -ForegroundColor Cyan
    Write-Host "  Log: $logFile" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    if (-not (Test-Path $p.File)) {
        Write-Host "ERROR: Prompt file not found: $($p.File)" -ForegroundColor Red
        exit 1
    }

    $serveAlive = Get-NetTCPConnection -LocalPort 4096 -ErrorAction SilentlyContinue
    if (-not $serveAlive) {
        Write-Host "ERROR: OpenCode serve not running on port 4096" -ForegroundColor Red
        exit 1
    }
    
    # Read prompt, pipe to opencode via stdin
    $prompt = Get-Content $p.File -Raw
    $exitCode = 0
    try {
        $prompt | & opencode run --format json --agent orchestrator --attach http://localhost:4096 2>&1 | Tee-Object -FilePath $logFile
        if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
    }
    catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $exitCode = 1
    }
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "  Phase $($p.Phase) completed successfully." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Phase $($p.Phase) FAILED (exit code $exitCode)." -ForegroundColor Red
        Write-Host "  Log: $logFile" -ForegroundColor Yellow
        Write-Host "  Pipeline stopped. Fix issues and re-run." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ALL PHASES COMPLETE" -ForegroundColor Green
Write-Host "  $(Get-Date)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
