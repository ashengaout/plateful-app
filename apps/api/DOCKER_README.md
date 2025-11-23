# Docker Deployment Guide

This guide explains how to build and deploy the Plateful API using Docker.

## Files Created

- `Dockerfile` - Multi-stage Docker build configuration
- `.dockerignore` - Files to exclude from Docker build context
- `docker-compose.yml` - Local development/testing setup
- `scripts/deploy-docker.ps1` - Azure deployment script
- `scripts/test-docker-local.ps1` - Local testing script

## Local Testing

### Option 1: Using the test script

```powershell
cd apps/api/scripts
powershell -ExecutionPolicy Bypass -File test-docker-local.ps1
```

### Option 2: Manual build and run

```bash
# From project root
docker build -f apps/api/Dockerfile -t plateful-api:local .

# Run the container
docker run -p 3001:8080 plateful-api:local

# Test the health endpoint
curl http://localhost:3001/health
```

### Option 3: Using docker-compose

```bash
cd apps/api
docker-compose up --build
```

## Azure Deployment

### Prerequisites

1. Azure CLI installed and logged in
2. Docker installed and running
3. App Service already created (`plateful` in `rg-plateful`)

### Deployment Steps

1. **Run the deployment script:**
   ```powershell
   cd apps/api/scripts
   powershell -ExecutionPolicy Bypass -File deploy-docker.ps1
   ```

2. **Choose deployment method:**
   - **Azure Container Registry (Recommended)**: Type `y` when prompted
     - Script will create ACR if it doesn't exist
     - Builds and pushes the image
     - Configures App Service to use the image
   - **Local build only**: Type `n` when prompted
     - Builds image locally for testing
     - You can push to Docker Hub manually if needed

3. **Verify deployment:**
   - Check App Service logs: `az webapp log tail --name plateful --resource-group rg-plateful`
   - Visit: `https://plateful.azurewebsites.net/health`

## Dockerfile Structure

The Dockerfile uses a multi-stage build:

1. **Builder stage**: 
   - Installs all dependencies
   - Builds shared package
   - Builds API

2. **Production stage**:
   - Installs only production dependencies
   - Copies built artifacts
   - Sets up workspace package linking
   - Runs the server

## Environment Variables

Azure App Service will provide:
- `PORT` - Port to listen on (defaults to 8080 in container, Azure sets this)
- `NODE_ENV=production`

Add your environment variables in Azure Portal:
- Azure Portal → App Service → Configuration → Application settings

## Troubleshooting

### Build fails with "Cannot find module"
- Ensure all source files are copied in the Dockerfile
- Check that `packages/shared` is built before API

### Container starts but returns 503
- Check App Service logs: `az webapp log tail --name plateful --resource-group rg-plateful`
- Verify PORT environment variable is set correctly
- Ensure health endpoint is accessible: `/health`

### Image too large
- The multi-stage build already optimizes size
- Production stage only includes production dependencies
- Consider using `.dockerignore` to exclude unnecessary files

### ACR authentication issues
- Ensure ACR admin user is enabled: `az acr update --name platefulregistry --admin-enabled true`
- Re-run the deployment script

## Benefits of Docker Deployment

✅ **Self-contained**: No node_modules copying issues  
✅ **Testable**: Test locally before deploying  
✅ **Faster**: Docker layer caching speeds up rebuilds  
✅ **Consistent**: Same environment locally and in production  
✅ **Reliable**: No dependency hoisting issues  

## Next Steps

1. Test locally first: `docker run -p 3001:8080 plateful-api:local`
2. Verify health endpoint works
3. Deploy to Azure using the script
4. Monitor logs and verify deployment


