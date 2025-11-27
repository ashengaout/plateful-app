# Local API Testing Guide

## Quick Start

### 1. Set up environment variables

Create a `.env` file in `apps/api/` with:

```bash
# Required
ANTHROPIC_API_KEY=your-anthropic-key-here
COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
COSMOS_KEY=your-cosmos-key-here
COSMOS_DATABASE=plateful-core

# Optional
YOUTUBE_API_KEY=your-youtube-key-here
```

**Note:** If you don't have Cosmos DB set up locally, the API will use mock chat routes (which is fine for testing recipe generation).

### 2. Build shared package (if needed)

```bash
# From project root
npm run build --workspace=@plateful/shared
```

### 3. Start the API server

```bash
# From project root
npm run api

# OR from apps/api directory
cd apps/api
npm run dev
```

The server will start on `http://localhost:3001`

### 4. Verify it's running

Open `http://localhost:3001/health` in your browser - you should see:
```json
{"status":"ok","timestamp":"..."}
```

### 5. Test with mobile app

The mobile app is already configured to use `localhost:3001` in development mode. Just run your mobile app and it will connect to the local API.

**For Android emulator:** Uses `http://10.0.2.2:3001` automatically  
**For iOS simulator:** Uses `http://localhost:3001` automatically  
**For web:** Uses `http://localhost:3001` automatically

## Testing Recipe Generation

1. Start the API locally (step 3 above)
2. Run your mobile app
3. Try generating a recipe in the chat
4. Watch the API console for logs showing:
   - Recipe search progress
   - Scraping attempts (with new faster timeouts)
   - Formatting progress
   - Any errors

## What Changed (for testing)

- **Scraper timeout:** 30s → 20s per attempt
- **Retries:** 3 → 2 attempts
- **4xx errors:** Fail immediately (no retries)
- **Formatting timeout:** 60s max
- **Frontend timeout:** 120s total

## Troubleshooting

### API won't start
- Check that port 3001 is not in use
- Verify `.env` file exists in `apps/api/`
- Make sure `@plateful/shared` is built

### Mobile app can't connect
- Verify API is running: `curl http://localhost:3001/health`
- Check mobile app logs for connection errors
- For Android emulator, ensure using `10.0.2.2:3001`

### Recipe generation still times out
- Check API console logs for specific errors
- Verify ANTHROPIC_API_KEY is set correctly
- Check network connectivity

## After Testing

Once you've verified the changes work locally:

1. Commit your changes
2. Deploy to Azure using your normal deployment process
3. The same code will work in production


