# Azure App Service Deployment Guide

**Document Version:** 1.0.0  
**Last Updated:** December 2024  
**Target:** Plateful API Backend

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Environment Variables](#environment-variables)
6. [Deployment Steps](#deployment-steps)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Updating the Deployment](#updating-the-deployment)

---

## Overview

This guide covers deploying the Plateful API backend to Azure App Service. Azure App Service provides:

- **Always-on Node.js process** (no cold starts)
- **Auto-scaling** (configurable)
- **Public URL** accessible from emulators and devices
- **Integrated with Azure Cosmos DB** (already in use)
- **No timeout limits** (unlike Vercel's 10s/60s limits)
- **No Docker required** - Direct Node.js deployment

### Architecture

```
Mobile App (Expo)
    ↓ HTTP/HTTPS
Azure App Service (Linux)
    ├── Hono API Server (Node.js 18)
    ├── Azure Cosmos DB (existing)
    └── External APIs (Anthropic Claude, Google APIs)
```

### Why Azure App Service?

- **Simpler than Docker**: No containerization needed, just deploy Node.js directly
- **Matches your architecture**: Runs `server.ts` as-is (continuous process, not serverless)
- **Better than Vercel**: No timeout limits, no cold starts, no function restructuring needed
- **Cost-effective**: Pay only for what you use

---

## Prerequisites

### Required Tools

1. **Azure CLI** (v2.50.0 or later)
   ```bash
   # Install Azure CLI
   # Windows: https://aka.ms/installazurecliwindows
   # macOS: brew install azure-cli
   # Linux: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
   
   # Verify installation
   az --version
   ```

2. **Node.js 18+** and **npm 9+** (for building)
   ```bash
   node --version  # Should be 18.x or higher
   npm --version   # Should be 9.x or higher
   ```

3. **Zip utility** (for deployment)
   - Windows: Built-in
   - macOS/Linux: `zip` command (usually pre-installed)

### Azure Account Setup

1. **Azure Subscription**
   - Sign up at https://azure.microsoft.com/free/
   - Free tier includes $200 credit for 30 days

2. **Login to Azure**
   ```bash
   az login
   # Follow browser prompt to authenticate
   ```

3. **Set Default Subscription** (if you have multiple)
   ```bash
   az account list --output table
   az account set --subscription "Your Subscription Name"
   ```

---

## Quick Start

### 1. Set Environment Variables

```bash
# Navigate to API directory
cd apps/api

# Copy example environment file (if you have one)
# Edit with your actual values
```

### 2. Configure Deployment Script

Edit `apps/api/scripts/deploy-azure-app-service.sh` and set these variables:

```bash
RESOURCE_GROUP="plateful-rg"
APP_SERVICE_NAME="plateful-api"  # Must be globally unique
APP_SERVICE_PLAN="plateful-plan"
LOCATION="eastus"  # or your preferred Azure region
```

### 3. Deploy to Azure

```bash
# Make script executable (Linux/macOS)
chmod +x apps/api/scripts/deploy-azure-app-service.sh

# Option 1: Load from .env file (recommended)
cd apps/api
export $(cat .env | grep -v '^#' | xargs)

# Option 2: Set environment variables manually
export ANTHROPIC_API_KEY="your-key"
export COSMOS_ENDPOINT="https://your-cosmos.documents.azure.com:443/"
export COSMOS_KEY="your-cosmos-key"
export YOUTUBE_API_KEY="your-youtube-key"  # Optional but recommended

# Run deployment
./scripts/deploy-azure-app-service.sh
```

**Note:** The script will automatically use any environment variables you've set. If you have a `.env` file in `apps/api/`, you can load it before running the deployment script.

The script will output your API URL:
```
✅ Deployment complete!
📍 API URL: https://plateful-api.azurewebsites.net
🏥 Health check: https://plateful-api.azurewebsites.net/health
```

---

## Detailed Setup

### Step 1: Create Resource Group

```bash
RESOURCE_GROUP="plateful-rg"
LOCATION="eastus"

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"
```

### Step 2: Create App Service Plan

```bash
APP_SERVICE_PLAN="plateful-plan"

# Create Linux App Service Plan (B1 = Basic tier, ~$13/month)
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --is-linux \
  --sku B1
```

**SKU Options:**
- `F1` - Free tier (limited features, not recommended for production)
- `B1` - Basic tier (~$13/month, good for development)
- `S1` - Standard tier (~$73/month, better for production)

### Step 3: Create Web App

```bash
APP_SERVICE_NAME="plateful-api"  # Must be globally unique (lowercase, alphanumeric, hyphens)

az webapp create \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "NODE:18-lts"
```

### Step 4: Configure App Settings

```bash
# Set Node.js version and environment
az webapp config appsettings set \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "WEBSITE_NODE_DEFAULT_VERSION=18-lts" \
    "NODE_ENV=production" \
    "PORT=3001" \
    "COSMOS_DATABASE=plateful-core"

# Set startup command
az webapp config set \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --startup-file "npm start"
```

### Step 5: Set Secrets (Environment Variables)

```bash
# Set sensitive environment variables
az webapp config appsettings set \
  --name "$APP_SERVICE_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    "ANTHROPIC_API_KEY=your-anthropic-key" \
    "COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/" \
    "COSMOS_KEY=your-cosmos-key" \
    "YOUTUBE_API_KEY=your-youtube-key"
```

### Step 6: Deploy Application

```bash
# Navigate to project root
cd ../..

# Build dependencies
npm run build --workspace=@plateful/shared
npm run build --workspace=api

# Navigate to API directory
cd apps/api

# Create deployment package (exclude unnecessary files)
zip -r deploy.zip . \
  -x "node_modules/*" \
  -x "__tests__/*" \
  -x "*.test.ts" \
  -x "*.test.js" \
  -x "jest.config.js" \
  -x ".env*" \
  -x "dist/__tests__/*"

# Deploy
az webapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_NAME" \
  --src deploy.zip

# Clean up
rm deploy.zip
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | `sk-ant-...` |
| `COSMOS_ENDPOINT` | Azure Cosmos DB endpoint | `https://xxx.documents.azure.com:443/` |
| `COSMOS_KEY` | Azure Cosmos DB primary key | `xxx==` |
| `COSMOS_DATABASE` | Cosmos DB database name | `plateful-core` |
| `YOUTUBE_API_KEY` | YouTube Data API key (for tutorial search) | `AIza...` |
| `PORT` | Server port (Azure sets this automatically) | `3001` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | `*` (all) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (if using Firebase) | - |

**Note:** `YOUTUBE_API_KEY` is optional but recommended. Without it, YouTube tutorial search features will be disabled.

### Setting Environment Variables

**Option 1: Via Azure CLI**
```bash
az webapp config appsettings set \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --settings "ALLOWED_ORIGINS=https://yourapp.com"
```

**Option 2: Via Azure Portal**
1. Navigate to your Web App
2. Go to **Configuration** → **Application settings**
3. Add/edit variables
4. Click **Save**

---

## Deployment Steps

### Automated Deployment (Recommended)

Use the provided deployment script:

```bash
cd apps/api

# Set environment variables
export ANTHROPIC_API_KEY="your-key"
export COSMOS_ENDPOINT="https://your-cosmos.documents.azure.com:443/"
export COSMOS_KEY="your-key"

# Run deployment
chmod +x scripts/deploy-azure-app-service.sh
./scripts/deploy-azure-app-service.sh
```

### Manual Deployment

Follow the [Detailed Setup](#detailed-setup) section above.

### Alternative: Deploy from Git

You can also deploy directly from a Git repository:

```bash
# Configure Git deployment
az webapp deployment source config \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --repo-url "https://github.com/yourusername/plateful-app.git" \
  --branch main \
  --manual-integration
```

---

## Testing

### 1. Test Health Endpoint

```bash
# Get your app URL
APP_URL=$(az webapp show \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostName -o tsv)

# Test health endpoint
curl "https://${APP_URL}/health"

# Expected response:
# {"status":"ok","timestamp":"2024-...","service":"plateful-api","version":"1.0.0"}
```

### 2. Test from Mobile App

Update your mobile app's `.env` file:

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=https://your-app.azurewebsites.net
```

Or set it in the API config:

```typescript
// apps/mobile/src/config/api.ts
// The getApiBaseUrl() function will use EXPO_PUBLIC_API_URL if set
```

### 3. View Logs

```bash
# Stream logs
az webapp log tail \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP"

# Download logs
az webapp log download \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --log-file app-logs.zip
```

### 4. Check App Status

```bash
az webapp show \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --query "state"
```

---

## Troubleshooting

### Issue: Deployment Fails

**Symptoms:**
- `az webapp create` fails
- Zip deployment fails

**Solutions:**
1. Verify app name is globally unique:
   ```bash
   # Try a different name
   APP_SERVICE_NAME="plateful-api-$(date +%s)"
   ```

2. Check resource group exists:
   ```bash
   az group show --name "$RESOURCE_GROUP"
   ```

3. Verify App Service Plan exists:
   ```bash
   az appservice plan list --resource-group "$RESOURCE_GROUP"
   ```

### Issue: App Won't Start

**Symptoms:**
- App shows "Application Error"
- Health endpoint returns 502

**Solutions:**
1. Check logs:
   ```bash
   az webapp log tail \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP"
   ```

2. Verify startup command:
   ```bash
   az webapp config show \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP" \
     --query "linuxFxVersion"
   ```

3. Check environment variables:
   ```bash
   az webapp config appsettings list \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP"
   ```

4. Verify Node.js version:
   ```bash
   az webapp config appsettings list \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP" \
     --query "[?name=='WEBSITE_NODE_DEFAULT_VERSION'].value"
   ```

### Issue: Module Not Found Errors

**Symptoms:**
- "Cannot find module '@plateful/shared'"
- Build errors

**Solutions:**
1. Ensure shared package is built:
   ```bash
   npm run build --workspace=@plateful/shared
   ```

2. Check deployment includes `node_modules`:
   - App Service should install dependencies automatically
   - If not, ensure `package.json` is in the deployment

3. Verify workspace structure is preserved in deployment

### Issue: CORS Errors

**Symptoms:**
- Mobile app can't connect
- CORS errors in browser console

**Solutions:**
1. Update `ALLOWED_ORIGINS` environment variable:
   ```bash
   az webapp config appsettings set \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP" \
     --settings "ALLOWED_ORIGINS=*"
   ```

2. For production, specify exact origins:
   ```bash
   az webapp config appsettings set \
     --name "plateful-api" \
     --resource-group "$RESOURCE_GROUP" \
     --settings "ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com"
   ```

### Issue: Cosmos DB Connection Fails

**Symptoms:**
- "Chat service not available" errors
- Cosmos DB connection timeouts

**Solutions:**
1. Verify Cosmos DB credentials:
   ```bash
   az cosmosdb keys list \
     --name "your-cosmos-account" \
     --resource-group "$RESOURCE_GROUP"
   ```

2. Check network connectivity (App Service can access Cosmos DB by default)

3. Verify database and containers exist:
   - Database: `plateful-core`
   - Containers: `chat-conversations`, `chat-messages`, etc.

---

## Updating the Deployment

### Update Code and Redeploy

```bash
# 1. Make code changes
# 2. Rebuild
npm run build --workspace=@plateful/shared
npm run build --workspace=api

# 3. Redeploy
cd apps/api
zip -r deploy.zip . -x "node_modules/*" "__tests__/*" "*.test.ts" "*.test.js" "jest.config.js" ".env*"

az webapp deployment source config-zip \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_NAME" \
  --src deploy.zip

rm deploy.zip
```

Or use the deployment script:
```bash
./scripts/deploy-azure-app-service.sh
```

### Update Environment Variables

```bash
az webapp config appsettings set \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP" \
  --settings "NEW_VAR=value"
```

### Restart App

```bash
az webapp restart \
  --name "plateful-api" \
  --resource-group "$RESOURCE_GROUP"
```

---

## Cost Estimation

Azure App Service pricing (as of 2024):

- **Free Tier (F1)**: Free, but limited (not recommended)
- **Basic Tier (B1)**: ~$13/month
  - 1.75 GB RAM
  - 1 vCPU
  - 10 GB storage
- **Standard Tier (S1)**: ~$73/month
  - 1.75 GB RAM
  - 1 vCPU
  - 50 GB storage
  - Auto-scaling

**Recommendation**: Start with B1 for development, upgrade to S1 for production.

---

## Security Best Practices

1. **Use Application Settings for Secrets**
   - Azure encrypts application settings at rest
   - Don't commit secrets to Git

2. **Restrict CORS Origins**
   - Don't use `*` in production
   - Specify exact allowed origins

3. **Enable HTTPS Only**
   - App Service uses HTTPS by default
   - No additional configuration needed

4. **Enable Authentication (Optional)**
   - Use Azure AD authentication if needed
   - Configure in App Service → Authentication

5. **Monitor Access**
   - Enable Azure Monitor
   - Set up alerts for errors

---

## Additional Resources

- [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
- [Azure CLI Reference](https://docs.microsoft.com/cli/azure/webapp)
- [Node.js on App Service](https://docs.microsoft.com/azure/app-service/quickstart-nodejs)

---

## Support

For issues specific to this deployment:
1. Check logs: `az webapp log tail --name plateful-api --resource-group plateful-rg`
2. Review troubleshooting section above
3. Check Azure App Service status: https://status.azure.com/
