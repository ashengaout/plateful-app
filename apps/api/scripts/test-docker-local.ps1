# Test Docker build locally
$ErrorActionPreference = "Continue"

# Script is in apps/api/scripts, so go up 3 levels to get project root
$PROJECT_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$IMAGE_NAME = "plateful-api:local"

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Testing Docker Build Locally" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host "`nBuilding Docker image..." -ForegroundColor Yellow
Set-Location $PROJECT_ROOT
docker build -f apps/api/Dockerfile -t $IMAGE_NAME .

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker build failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n[SUCCESS] Docker image built!" -ForegroundColor Green
Write-Host "`nTo test the container, run:" -ForegroundColor Yellow
Write-Host "  docker run -p 3001:8080 $IMAGE_NAME" -ForegroundColor Cyan
Write-Host "`nThen visit: http://localhost:3001/health" -ForegroundColor Cyan
Write-Host "`nOr use docker-compose:" -ForegroundColor Yellow
Write-Host "  cd apps/api" -ForegroundColor Cyan
Write-Host "  docker-compose up" -ForegroundColor Cyan







