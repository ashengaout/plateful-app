# Docker deployment script for Azure App Service
$ErrorActionPreference = "Continue"
$env:PYTHONWARNINGS = "ignore"

$RESOURCE_GROUP = "rg-plateful"
$APP_SERVICE_NAME = "plateful"
$DOCKER_IMAGE_NAME = "plateful-api"
$REGISTRY_NAME = "platefulregistry"  # Azure Container Registry name (create if needed)

# Script is in apps/api/scripts, so go up 3 levels to get project root
$PROJECT_ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$API_DIR = Join-Path $PROJECT_ROOT "apps\api"

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Docker Deployment to Azure App Service" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Verify app exists
Write-Host "`nVerifying app service exists..." -ForegroundColor Yellow
$appCheck = az webapp show --name $APP_SERVICE_NAME --resource-group $RESOURCE_GROUP --query "name" -o tsv 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] App service not found: $APP_SERVICE_NAME" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] App service found" -ForegroundColor Green

# Option 1: Build and push to Azure Container Registry
Write-Host "`nDo you want to use Azure Container Registry? (y/n)" -ForegroundColor Yellow
$useACR = Read-Host
if ($useACR -eq "y" -or $useACR -eq "Y") {
    # Check if ACR exists
    $acrCheck = az acr show --name $REGISTRY_NAME --resource-group $RESOURCE_GROUP --query "name" -o tsv 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating Azure Container Registry..." -ForegroundColor Yellow
        az acr create --resource-group $RESOURCE_GROUP --name $REGISTRY_NAME --sku Basic --admin-enabled true
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to create ACR" -ForegroundColor Red
            exit 1
        }
    }
    
    $acrLoginServer = az acr show --name $REGISTRY_NAME --resource-group $RESOURCE_GROUP --query loginServer -o tsv
    $fullImageName = "$acrLoginServer/$DOCKER_IMAGE_NAME:latest"
    
    Write-Host "`nBuilding Docker image..." -ForegroundColor Yellow
    Set-Location $PROJECT_ROOT
    docker build -f apps/api/Dockerfile -t $fullImageName .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker build failed" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nLogging into Azure Container Registry..." -ForegroundColor Yellow
    az acr login --name $REGISTRY_NAME
    
    Write-Host "Pushing image to ACR..." -ForegroundColor Yellow
    docker push $fullImageName
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker push failed" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nConfiguring App Service to use Docker image..." -ForegroundColor Yellow
    $acrUsername = az acr credential show --name $REGISTRY_NAME --query username -o tsv
    $acrPassword = az acr credential show --name $REGISTRY_NAME --query passwords[0].value -o tsv
    
    az webapp config container set `
        --name $APP_SERVICE_NAME `
        --resource-group $RESOURCE_GROUP `
        --docker-custom-image-name $fullImageName `
        --docker-registry-server-url "https://$acrLoginServer" `
        --docker-registry-server-user $acrUsername `
        --docker-registry-server-password $acrPassword
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to configure App Service container" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`nRestarting App Service..." -ForegroundColor Yellow
    az webapp restart --name $APP_SERVICE_NAME --resource-group $RESOURCE_GROUP
    
    Write-Host "`n[SUCCESS] Docker deployment complete!" -ForegroundColor Green
} else {
    # Option 2: Build locally for testing
    Write-Host "`nBuilding Docker image locally..." -ForegroundColor Yellow
    Set-Location $PROJECT_ROOT
    docker build -f apps/api/Dockerfile -t $DOCKER_IMAGE_NAME:latest .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Docker build failed" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`n[SUCCESS] Docker image built locally!" -ForegroundColor Green
    Write-Host "`n[INFO] For Azure deployment, you can:" -ForegroundColor Yellow
    Write-Host "1. Push to Docker Hub and configure App Service to pull from there" -ForegroundColor Gray
    Write-Host "2. Use Azure Container Registry (run script again and choose 'y')" -ForegroundColor Gray
    Write-Host "3. Test locally first: docker run -p 3001:8080 $DOCKER_IMAGE_NAME:latest" -ForegroundColor Gray
}

$appUrl = az webapp show --name $APP_SERVICE_NAME --resource-group $RESOURCE_GROUP --query defaultHostName -o tsv 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nApp URL: https://$appUrl" -ForegroundColor Cyan
    Write-Host "Health: https://$appUrl/health" -ForegroundColor Cyan
}




