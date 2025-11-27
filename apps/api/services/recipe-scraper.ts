import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Extract image URL from HTML using multiple strategies
 */
function extractImageUrl($: cheerio.CheerioAPI, url: string): string | null {
  // Strategy 1: Check JSON-LD for Recipe image
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const json = JSON.parse($(scripts[i]).html() || '{}');
      if (json['@type'] === 'Recipe' || (Array.isArray(json['@type']) && json['@type'].includes('Recipe'))) {
        // Check for image field
        if (json.image) {
          if (typeof json.image === 'string') {
            return json.image;
          } else if (json.image.url) {
            return json.image.url;
          } else if (Array.isArray(json.image) && json.image.length > 0) {
            return typeof json.image[0] === 'string' ? json.image[0] : json.image[0].url || json.image[0];
          }
        }
      }
      // Also check @graph for Recipe items
      if (json['@graph'] && Array.isArray(json['@graph'])) {
        for (const item of json['@graph']) {
          if (item['@type'] === 'Recipe' && item.image) {
            if (typeof item.image === 'string') {
              return item.image;
            } else if (item.image.url) {
              return item.image.url;
            }
          }
        }
      }
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  // Strategy 2: Check Open Graph image
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    return ogImage.startsWith('http') ? ogImage : new URL(ogImage, url).href;
  }

  // Strategy 3: Check Twitter card image
  const twitterImage = $('meta[name="twitter:image"]').attr('content');
  if (twitterImage) {
    return twitterImage.startsWith('http') ? twitterImage : new URL(twitterImage, url).href;
  }

  // Strategy 4: Find main recipe image by common selectors
  const imageSelectors = [
    'img.recipe-image',
    'img[itemprop="image"]',
    '.recipe img:first',
    '.recipe-header img',
    '.recipe-content img:first',
    'article img:first',
    'main img:first',
  ];

  for (const selector of imageSelectors) {
    const img = $(selector).first();
    if (img.length > 0) {
      const src = img.attr('src') || img.attr('data-src');
      if (src) {
        return src.startsWith('http') ? src : new URL(src, url).href;
      }
    }
  }

  return null;
}

/**
 * Scrape recipe content and image from a URL
 * Returns object with content and optional imageUrl
 */
export interface ScrapeResult {
  content: string;
  imageUrl: string | null;
}

/**
 * Scrape recipe content from a URL
 */
export async function scrapeRecipeContent(url: string): Promise<string>;
export async function scrapeRecipeContent(url: string, includeImage: true): Promise<ScrapeResult>;
export async function scrapeRecipeContent(url: string, includeImage?: boolean): Promise<string | ScrapeResult> {
  const maxRetries = 2; // Reduced from 3 to fail faster and try more URLs
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Scraping content from: ${url} (attempt ${attempt}/${maxRetries})`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/' // Add referer to appear more legitimate
        },
        timeout: 15000, // 15 second timeout for scraping (fail faster to try more URLs)
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 500 // Accept 2xx, 3xx, and 4xx but fail on 5xx
      });
      
      // Handle non-200 status codes - don't retry on client errors (4xx)
      if (response.status === 403) {
        // Don't retry 403 - website is blocking us
        throw new Error(`Access forbidden (403) - website blocking scraper`);
      }
      
      if (response.status === 404) {
        // Don't retry 404 - page doesn't exist
        throw new Error(`Recipe page not found (404)`);
      }
      
      if (response.status >= 400 && response.status < 500) {
        // Don't retry other 4xx errors - client error
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (response.status >= 500) {
        // Retry 5xx errors - server error
        throw new Error(`Server error (${response.status}) - website may be down`);
      }
      
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    
      const $ = cheerio.load(response.data);
      
      // Extract image URL if requested (do this before removing elements)
      let imageUrl: string | null = null;
      if (includeImage) {
        imageUrl = extractImageUrl($, url);
        console.log(`📸 Extracted image URL: ${imageUrl || 'none found'}`);
      }
      
      // Remove unwanted elements
      $('script, style, nav, header, footer, .advertisement, .ads, .ad, .sidebar, .comments, .social-share, .related, .newsletter, noscript').remove();
      
      let content = '';
      
      // Strategy 1: Look for structured recipe markup (JSON-LD)
      const scripts = $('script[type="application/ld+json"]');
      for (let i = 0; i < scripts.length; i++) {
        try {
          const json = JSON.parse($(scripts[i]).html() || '{}');
          if (json['@type'] === 'Recipe' || json['@type']?.includes?.('Recipe')) {
            content = JSON.stringify(json, null, 2);
            console.log(`Found structured recipe markup`);
            break;
          }
        } catch (e) {
          // Not JSON-LD, continue
        }
      }
      
      // Strategy 2: Try to find recipe-specific content using common selectors
      if (!content || content.length < 200) {
        const recipeSelectors = [
          '[itemtype*="Recipe"]',
          '.recipe',
          '.recipe-content',
          '.recipe-body',
          '.recipe-instructions',
          '.recipe-ingredients',
          '.recipe-details',
          '.post-content',
          '.entry-content',
          '.article-content',
          '.content-wrapper',
          'article[class*="recipe"]',
          'main[class*="recipe"]',
          'article',
          'main',
        ];
        
        for (const selector of recipeSelectors) {
          const element = $(selector);
          if (element.length > 0) {
            const text = element.text().trim();
            if (text.length > 300) {
              content = text;
              console.log(`Found recipe content using selector: ${selector}`);
              break;
            }
          }
        }
      }
      
      // Strategy 3: Fallback to body content if no specific recipe content found
      if (!content || content.length < 200) {
        content = $('body').text().trim();
        console.log(`Using full body content as fallback`);
      }
      
      // Clean up the content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      
      console.log(`✅ Scraped ${content.length} characters from ${url}`);
      
      if (content.length < 100) {
        throw new Error('Scraped content is too short, likely failed to extract recipe');
      }
      
      if (includeImage) {
        return { content, imageUrl };
      }
      
      return content;
      
    } catch (error) {
      // Handle different types of errors
      if (axios.isAxiosError(error)) {
        if (error.response) {
          // HTTP error with response
          const status = error.response.status;
          const statusText = error.response.statusText;
          lastError = new Error(`HTTP ${status}: ${statusText}`);
          
          // Don't retry on 4xx errors (client errors) - they won't succeed on retry
          if (status >= 400 && status < 500) {
            console.error(`❌ Client error (${status}) - not retrying:`, statusText);
            throw lastError; // Exit immediately, don't retry
          }
        } else if (error.request) {
          // Network error (no response received)
          if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            lastError = new Error(`Network timeout: Request took longer than 15 seconds`);
          } else {
            lastError = new Error(`Network error: No response from server (${error.code || 'connection failed'})`);
          }
        } else {
          // Other axios error
          lastError = new Error(`Request error: ${error.message}`);
        }
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors (403, 404, etc.)
        if (error instanceof Error && (error.message.includes('403') || error.message.includes('404') || error.message.includes('forbidden') || error.message.includes('not found'))) {
          console.error(`❌ Client error - not retrying:`, error.message);
          throw error; // Exit immediately, don't retry
        }
      }
      
      console.error(`❌ Error scraping ${url} (attempt ${attempt}/${maxRetries}):`, lastError.message);
      
      if (attempt < maxRetries) {
        // Wait before retrying (shorter delay to fail faster)
        const delay = 1000; // 1 second delay between retries
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all retries failed
  console.error(`❌ Failed to scrape ${url} after ${maxRetries} attempts`);
  throw new Error(`Failed to scrape content from ${url} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

