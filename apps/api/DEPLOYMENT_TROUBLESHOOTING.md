# Azure Deployment Troubleshooting Guide

## Current Issue

**Problem:** Azure App Service deployment consistently fails with "ZipDeploy. Extract zip." error.

**Status:** Zip file extracts successfully locally, indicating the issue is with Azure's deployment engine, not the zip itself.

## What We've Tried

1. ✅ Disabled build during deployment (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`)
2. ✅ Fixed zip structure (files at root, not nested)
3. ✅ Used forward slashes for Linux compatibility
4. ✅ Reduced zip size (excluded unnecessary files)
5. ✅ Fixed start script path
6. ✅ Tried multiple deployment commands (`az webapp deploy`, `config-zip`)
7. ✅ Added Kudu API deployment
8. ✅ Stopped app before deployment
9. ✅ Verified zip extracts locally

## Recommended Next Steps

### Option 1: Test with Minimal Deployment (Quickest)

Test if Azure can extract ANY zip:

```powershell
cd C:\Dev\plateful-app
powershell -ExecutionPolicy Bypass -File apps/api/scripts/deploy-simple-test.ps1
```

This deploys a minimal 2-file application. If this fails, the Azure App Service itself may have issues.

###  Option 2: Try `az webapp up` (Easiest)

This command handles everything automatically:

```powershell
cd C:\Dev\plateful-app

# Build first
npm run build --workspace=@plateful/shared
npm run build --workspace=api

# Deploy
cd apps/api
az webapp up --name plateful-api --resource-group plateful-rg --runtime "NODE:18-lts" --location westus3
```

Pros:
- Handles deployment automatically
- No zip creation needed
- Simpler than manual deployment

Cons:
- May still encounter build issues

### Option 3: Use Docker Container (Most Reliable)

Deploy as a Docker container instead:

1. **Create Dockerfile:**

```dockerfile
# apps/api/Dockerfile
FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --production

# Copy application
COPY dist ./dist
COPY node_modules/@plateful ./node_modules/@plateful

EXPOSE 3001
CMD ["npm", "start"]
```

2. **Build and push:**

```powershell
cd apps/api

# Build image
docker build -t plateful-api .

# Tag for Azure Container Registry
docker tag plateful-api youracr.azurecr.io/plateful-api:latest

# Push
docker push youracr.azurecr.io/plateful-api:latest

# Deploy
az webapp config container set \
  --name plateful-api \
  --resource-group plateful-rg \
  --docker-custom-image-name youracr.azurecr.io/plateful-api:latest
```

### Option 4: Recreate App Service

The App Service itself may have issues:

```powershell
# Delete existing
az webapp delete --name plateful-api --resource-group plateful-rg

# Recreate
az webapp create \
  --name plateful-api \
  --resource-group plateful-rg \
  --plan plateful-plan \
  --runtime "NODE:18-lts"

# Try deployment again
```

### Option 5: Switch to Different Service

Consider alternatives:

1. **Azure Container Apps** (Modern, serverless containers)
2. **Azure Container Instances** (Simple containers)
3. **Vercel** (Your original target platform)
4. **Railway.app** (Simple Node.js hosting)
5. **Render.com** (Free tier available)

## Deployment via Vercel (Original Plan)

Since Azure is proving difficult, consider returning to Vercel:

```powershell
cd apps/api

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Vercel advantages:
- Built for Node.js/TypeScript
- Automatic builds
- Free tier available
- Better developer experience

## Contact Azure Support

If none of these work, the issue may be with your Azure subscription or region:

1. Go to Azure Portal
2. Click "Help + Support"
3. Create support ticket for "Technical" issue
4. Category: "App Service"
5. Describe the persistent "ZipDeploy. Extract zip." error

Include:
- Deployment logs from Kudu
- Zip file (attach a sample)
- Steps you've tried

## Debug Information

### Current Configuration

- **Resource Group:** plateful-rg
- **App Service:** plateful-api
- **Plan:** plateful-plan (FREE tier)
- **Runtime:** NODE:18-lts
- **Region:** westus3
- **Settings:**
  - `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
  - `ENABLE_ORYX_BUILD=false`
  - `NODE_ENV=production`
  - `PORT=3001`

### Deployment Logs

Access detailed logs at:
https://plateful-api.scm.azurewebsites.net/api/deployments

### Kudu Console

Access Kudu for manual inspection:
https://plateful-api.scm.azurewebsites.net

## Summary

The "ZipDeploy. Extract zip." error is persistent and not due to zip corruption (verified locally). This suggests:

1. Azure Free tier limitations
2. Regional issues with westus3
3. App Service configuration problem
4. Azure deployment engine bug

**Recommended immediate action:** Try Option 2 (`az webapp up`) as it's simplest and may bypass the zip extraction issue entirely.

**Long-term recommendation:** Consider Docker deployment (Option 3) or switching to a different platform (Vercel, Render, Railway) for better reliability.




