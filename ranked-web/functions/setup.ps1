# Setup Python venv for Cloud Functions (Windows PowerShell)
# Run from: ranked-web\functions

$ErrorActionPreference = "Stop"

Write-Host "Setting up Python environment for Cloud Functions..." -ForegroundColor Cyan

# Check for Python
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $v = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $python = $cmd
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host "ERROR: Python not found. Install from https://www.python.org/downloads/" -ForegroundColor Red
    Write-Host "  Make sure to check 'Add Python to PATH' during installation." -ForegroundColor Yellow
    exit 1
}

Write-Host "Using: $python" -ForegroundColor Green

# Create venv
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Cyan
    & $python -m venv venv
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "venv already exists." -ForegroundColor Green
}

# Activate and install
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& .\venv\Scripts\pip.exe install -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To run functions locally:" -ForegroundColor Cyan
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "  python run_local.py" -ForegroundColor White
Write-Host ""
Write-Host "To deploy (requires gcloud CLI):" -ForegroundColor Cyan
Write-Host "  .\deploy.bat" -ForegroundColor White
Write-Host ""
