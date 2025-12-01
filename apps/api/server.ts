import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { initCosmosDB, isCosmosAvailable } from './lib/cosmos';

// Import API routes
import chatRoutes from './api/chat';
import mockChatRoutes from './api/mock-chat';
import generateRecipeRoutes from './api/generate-recipe';
import extractIntentRoutes from './api/extract-intent';
import profileRoutes from './api/profile';
import pantryRoutes from './api/pantry';
import groceryRoutes from './api/grocery';
import tutorialsRoutes from './api/tutorials';
import mealTrackingRoutes from './api/meal-tracking';
import ingredientParserRoutes from './api/ingredient-parser';
import paymentRoutes from './api/payments';

// Load environment variables
dotenv.config();

// Initialize Cosmos DB
initCosmosDB();

const app = new Hono();

// CORS configuration - allow specific origins in production, all in development
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*']; // Default to allow all for development

app.use('*', cors({
  origin: allowedOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount API routes - use mock chat if Cosmos DB is not configured
if (isCosmosAvailable()) {
  console.log('✅ Using real Cosmos DB chat routes');
  app.route('/api/chat', chatRoutes);
} else {
  console.log('🎭 Cosmos DB not configured. Using mock chat routes for development.');
  app.route('/api/chat', mockChatRoutes);
}

app.route('/api/generate-recipe', generateRecipeRoutes);
app.route('/api/extract-intent', extractIntentRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/pantry', pantryRoutes);
app.route('/api/grocery', groceryRoutes);
app.route('/api/tutorials', tutorialsRoutes);
app.route('/api/meal-tracking', mealTrackingRoutes);
app.route('/api/parse-ingredients', ingredientParserRoutes);
app.route('/api/payments', paymentRoutes);

// Initialize Anthropic client
const client = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY 
});

// Web scraper function
async function scrapeRecipeContent(url: string): Promise<string> {
  try {
    console.log(`Scraping content from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $('script, style, nav, header, footer, .advertisement, .ads').remove();
    
    // Try to find recipe-specific content
    let content = '';
    
    // Look for common recipe content selectors
    const recipeSelectors = [
      '.recipe-content',
      '.recipe-body',
      '.recipe-instructions',
      '.recipe-ingredients',
      '.recipe-details',
      '.post-content',
      '.entry-content',
      '.content',
      'main',
      'article'
    ];
    
    for (const selector of recipeSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        if (content.length > 500) { // Only use if substantial content
          break;
        }
      }
    }
    
    // Fallback to body content if no specific recipe content found
    if (!content || content.length < 500) {
      content = $('body').text().trim();
    }
    
    // Clean up the content
    content = content
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
    
    console.log(`Scraped ${content.length} characters from ${url}`);
    return content;
    
  } catch (error) {
    console.error(`Error scraping ${url}:`, error instanceof Error ? error.message : String(error));
    throw new Error(`Failed to scrape content from ${url}`);
  }
}

app.post('/api/recipe', async (c) => {
  try {
    const { dish } = await c.req.json();
    
    if (!dish) {
      return c.json({ error: 'Dish name is required' }, 400);
    }

    console.log(`Searching for ${dish} recipe...`);
    
    // Step 1: Use web search to find recipe URLs
    const searchResponse = await (client.messages.create as any)({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search"
        }
      ],
      messages: [{
        role: "user",
        content: `Search for a ${dish} recipe on food52.com and return ONLY the URL of the best recipe page. Do not provide any other content, just the URL.`
      }]
    });

    // Extract URL from search response
    let recipeUrl = '';
    for (const block of searchResponse.content) {
      if (block.type === 'text') {
        const text = block.text;
        // Look for food52.com URLs in the response
        const urlMatch = text.match(/https:\/\/food52\.com\/recipes\/[^\s]+/);
        if (urlMatch) {
          recipeUrl = urlMatch[0];
          break;
        }
      }
    }

    if (!recipeUrl) {
      throw new Error('No recipe URL found in search results');
    }

    console.log(`Found recipe URL: ${recipeUrl}`);

    // Step 2: Scrape the full content from the recipe page
    const scrapedContent = await scrapeRecipeContent(recipeUrl);

    // Step 3: Use the model to format the scraped content into a clean recipe
    const formatResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Please format the following scraped recipe content into a clean, well-structured recipe in markdown format. Include the recipe title, ingredients list, and step-by-step instructions. Remove any unnecessary text, ads, or navigation elements.

IMPORTANT FORMATTING RULES:
- Use proper markdown formatting with # for title, ## for sections
- Use bullet points (-) for ingredients, not numbered lists
- Use numbered lists (1., 2., 3.) for instructions
- Do NOT include stray bullet points or formatting artifacts
- End with a "Source:" line containing the URL

Scraped content from ${recipeUrl}:
${scrapedContent}

Please provide ONLY the formatted recipe in markdown, starting with the recipe title and ending with the source URL.`
      }]
    });

    // Extract the formatted recipe
    let recipeText = '';
    for (const block of formatResponse.content) {
      if (block.type === 'text') {
        recipeText += block.text;
      }
    }

    return c.json({ 
      recipe: recipeText,
      dish: dish,
      sourceUrl: recipeUrl
    });

  } catch (error) {
    console.error('Recipe API error:', error);
    return c.json({ error: 'Failed to fetch recipe' }, 500);
  }
});

app.get('/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'plateful-api',
    version: '1.0.0'
  });
});

// Stripe checkout success/cancel pages
app.get('/upgrade', (c) => {
  const success = c.req.query('success');
  const canceled = c.req.query('canceled');
  const sessionId = c.req.query('session_id');

  if (success === 'true') {
    // Success page
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful - Plateful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #333;
            }
            .container {
              background: white;
              border-radius: 16px;
              padding: 40px;
              max-width: 400px;
              text-align: center;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            .success-icon {
              font-size: 64px;
              color: #10b981;
              margin-bottom: 20px;
            }
            h1 {
              color: #1f2937;
              margin: 0 0 16px 0;
              font-size: 24px;
            }
            p {
              color: #6b7280;
              margin: 0 0 24px 0;
              line-height: 1.6;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              transition: background 0.2s;
            }
            .button:hover {
              background: #5568d3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>Payment Successful!</h1>
            <p>Your premium subscription has been activated. You can now close this page and return to the Plateful app.</p>
            <p style="font-size: 14px; color: #9ca3af;">Your subscription will be active shortly.</p>
          </div>
          <script>
            // Try to open the app via deep link after a short delay
            setTimeout(() => {
              try {
                window.location.href = 'plateful://upgrade?success=true';
              } catch (e) {
                console.log('Could not open app deep link');
              }
            }, 2000);
          </script>
        </body>
      </html>
    `);
  } else if (canceled === 'true') {
    // Cancel page
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Canceled - Plateful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #333;
            }
            .container {
              background: white;
              border-radius: 16px;
              padding: 40px;
              max-width: 400px;
              text-align: center;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            .cancel-icon {
              font-size: 64px;
              color: #ef4444;
              margin-bottom: 20px;
            }
            h1 {
              color: #1f2937;
              margin: 0 0 16px 0;
              font-size: 24px;
            }
            p {
              color: #6b7280;
              margin: 0 0 24px 0;
              line-height: 1.6;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              transition: background 0.2s;
            }
            .button:hover {
              background: #5568d3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="cancel-icon">✕</div>
            <h1>Payment Canceled</h1>
            <p>Your payment was canceled. No charges were made. You can return to the Plateful app to try again.</p>
          </div>
          <script>
            // Try to open the app via deep link after a short delay
            setTimeout(() => {
              try {
                window.location.href = 'plateful://upgrade?canceled=true';
              } catch (e) {
                console.log('Could not open app deep link');
              }
            }, 2000);
          </script>
        </body>
      </html>
    `);
  }

  // Default redirect
  return c.redirect('/health');
});

// Use PORT from environment (Azure provides this) or default to 3001
const port = parseInt(process.env.PORT || '3001', 10);
const hostname = '0.0.0.0'; // Listen on all interfaces

console.log(`🚀 Plateful API Server starting on port ${port}`);
console.log(`📍 Health check: http://localhost:${port}/health`);

serve({
  fetch: app.fetch,
  port,
  hostname
});







