# Azure App Service Quota Exceeded - Fix Guide

## Current Issue

**Status:** `QuotaExceeded` - The Free tier App Service has hit its quota limit.

**App:** `plateful` in resource group `rg-plateful`

## Solutions

### Option 1: Upgrade to Basic Tier (Recommended)

The Free tier has strict limits. Upgrade to Basic tier (~$13/month):

```powershell
# Upgrade the App Service Plan
az appservice plan update `
    --name <plan-name> `
    --resource-group rg-plateful `
    --sku B1

# Restart the app
az webapp start --name plateful --resource-group rg-plateful
```

**Benefits:**
- No quota limits
- Always-on support
- Better performance
- Custom domains
- SSL certificates

### Option 2: Wait for Quota Reset

Free tier quotas reset periodically (usually daily). You can:
1. Wait 24 hours
2. Check quota status in Azure Portal
3. Restart the app when quota resets

### Option 3: Delete and Recreate (Free Tier)

If you want to stay on Free tier:

```powershell
# Delete the app service
az webapp delete --name plateful --resource-group rg-plateful

# Recreate with a new name (to get fresh quota)
az webapp create `
    --name plateful-new-$(Get-Random) `
    --resource-group rg-plateful `
    --plan <plan-name> `
    --runtime "NODE|20-lts"
```

**Note:** This will lose all deployment history and settings.

### Option 4: Switch to Different Platform

Consider alternatives that don't have quota limits:

1. **Vercel** (Original plan)
   - Free tier with generous limits
   - Built for Node.js/TypeScript
   - Better developer experience

2. **Railway.app**
   - $5/month for unlimited usage
   - Simple deployment
   - No quota issues

3. **Render.com**
   - Free tier available
   - Better than Azure Free tier

4. **Fly.io**
   - Generous free tier
   - Great for Node.js apps

## Check Current Quota

View quota usage in Azure Portal:
1. Go to your App Service
2. Click "Quotas" in the left menu
3. See which quotas are exceeded

## Recommended Action

**For production:** Upgrade to Basic tier (B1) - $13/month is reasonable for a production API.

**For development:** Consider switching to Vercel or Railway for better free tier experience.

## After Fixing Quota

Once the app is running again, test it:

```powershell
$url = "https://plateful-c9g9g7ccd3hqa2ga.westus3-01.azurewebsites.net"
curl "$url/health"
```

Expected response:
```json
{"status":"ok","timestamp":"...","service":"plateful-api","version":"1.0.0"}
```




