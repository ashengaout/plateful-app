import Anthropic from '@anthropic-ai/sdk';
import type { RecipeSearchResult, FoodProfile } from '@plateful/shared';

/**
 * Search for recipes using Anthropic's web search
 * Returns multiple recipe options from different websites
 */
export async function searchRecipe(
  searchQuery: string, 
  profile?: FoodProfile | null,
  allowSubstitutions: boolean = false
): Promise<RecipeSearchResult[]> {
  // Initialize client with current environment variables
  const client = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY 
  });

  // Modify search query based on cooking proficiency
  let modifiedSearchQuery = searchQuery;
  if (profile?.cookingProficiency) {
    console.log(`🔧 Cooking proficiency detected: ${profile.cookingProficiency}`);
    if (profile.cookingProficiency === 1) {
      // Level 1 (Beginner): Add "easy kid friendly"
      modifiedSearchQuery = `${searchQuery} easy kid friendly`;
      console.log(`✅ Modified search query for Beginner: "${modifiedSearchQuery}"`);
    } else if (profile.cookingProficiency === 2) {
      // Level 2 (Novice): Add "easy"
      modifiedSearchQuery = `${searchQuery} easy`;
      console.log(`✅ Modified search query for Novice: "${modifiedSearchQuery}"`);
    }
    // Level 3 (Intermediate): No modification (neutral)
    // Level 4-5 (Experienced/Advanced): Handled via context below
  } else {
    console.log(`ℹ️ No cooking proficiency in profile, using original query`);
  }

  console.log(`🔍 Searching for recipe: "${modifiedSearchQuery}" (original: "${searchQuery}")`);

  // Build dietary restrictions context for search
  // Only use profile preferences if user has premium subscription
  let restrictionsNote = '';
  if (profile && profile.isPremium) {
    const restrictions: string[] = [];
    if (profile.allergens && profile.allergens.length > 0) {
      restrictions.push(`allergen-free: ${profile.allergens.join(', ')}`);
    }
    if (profile.restrictions && profile.restrictions.length > 0) {
      restrictions.push(`without: ${profile.restrictions.join(', ')}`);
    }
    if (restrictions.length > 0) {
      if (allowSubstitutions) {
        // Relaxed search: note restrictions but don't filter (we'll substitute later)
        restrictionsNote = `\n\nNOTE: User has dietary restrictions (${restrictions.join(', ')}). Return recipes even if they contain these - substitutions will be handled automatically.`;
      } else {
        // Strict search: filter out recipes with restricted ingredients
        restrictionsNote = `\n\nIMPORTANT: The recipe must be ${restrictions.join(', ')}. Filter out any recipes that contain these.`;
      }
    }
  }

  // Build cooking proficiency context for search (only if premium)
  let proficiencyNote = '';
  if (profile?.isPremium && profile?.cookingProficiency) {
    if (profile.cookingProficiency === 1 || profile.cookingProficiency === 2) {
      // Levels 1-2: Emphasize simple, beginner-friendly recipes
      proficiencyNote = `\n\nIMPORTANT: Prioritize simple, beginner-friendly recipes with clear step-by-step instructions.`;
    } else if (profile.cookingProficiency === 4 || profile.cookingProficiency === 5) {
      // Levels 4-5: Prefer advanced techniques when available, but don't exclude simple recipes
      proficiencyNote = `\n\nNOTE: Prefer recipes with advanced techniques or complex methods when available, but simple recipes are acceptable if that's what the dish naturally is (e.g., grilled cheese sandwich).`;
    }
    // Level 3: No special context (neutral)
  }

  // Build equipment context for search (only if premium)
  // NOTE: Preferred equipment is NOT included in search query - it's too restrictive
  // (e.g., searching "noodle dish dutch oven" would fail). Preferred equipment is used
  // for post-search ranking instead.
  let equipmentNote = '';
  if (profile && profile.isPremium) {
    if (profile.unavailableEquipment && profile.unavailableEquipment.length > 0) {
      equipmentNote = `\n\nCRITICAL: Do NOT return recipes that require: ${profile.unavailableEquipment.join(', ')}. These are hard filters - exclude any recipe that needs these.`;
    }
    // Preferred equipment is handled post-search for ranking, not in the search query
  }

  const response = await (client.messages.create as any)({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        // Block problematic domains that return 403 or 500 errors
        blocked_domains: [
          "thekitchn.com",
          "foodnetwork.com", 
          "tasty.co",
          "buzzfeed.com",
          "showmetheyummy.com",
          "tastesbetterfromscratch.com",
          "allrecipes.com",
          "food.com",
          "epicurious.com",
          "bonappetit.com",
          "thehealthyhunterblog.com", // Consistently returns 500 errors
          // Recently blocked domains (403 errors)
          "glutenfreecuppatea.co",
          "schoolnightvegan.com",
          "noracooks.com",
          "simplyleb.com",
          "theyummybowl.com",
        ],
        // Prefer reliable recipe sites
      }
    ],
    messages: [{
      role: "user",
      content: `Search for: ${modifiedSearchQuery}${restrictionsNote}${proficiencyNote}${equipmentNote}


Find a specific recipe page URL (not a homepage or category page) from any reliable cooking website.

IMPORTANT: Return a URL to a specific recipe page that contains ingredients and instructions, NOT a homepage or category listing page.

Return a JSON array with 8-10 different recipe options, each from a DIFFERENT website/domain.
Each recipe should be a JSON object with this structure:
{
  "title": "Recipe title",
  "url": "Full URL to the specific recipe page (not homepage)",
  "snippet": "Brief description"
}

Return ONLY the JSON array, no other text. Example:
[
  {"title": "Recipe 1", "url": "https://site1.com/recipe", "snippet": "Description 1"},
  {"title": "Recipe 2", "url": "https://site2.com/recipe", "snippet": "Description 2"},
  {"title": "Recipe 3", "url": "https://site3.com/recipe", "snippet": "Description 3"}
]`
    }]
  });

  // Extract the response text - handle all block types
  let resultText = '';
  console.log(`📦 Response content structure: ${response.content?.length || 0} blocks`);
  
  for (const block of response.content) {
    if (block.type === 'text') {
      resultText += block.text;
    } else if (block.type === 'tool_use') {
      // Tool use blocks - log for debugging
      console.log(`🔧 Found tool_use block: ${block.name || 'unknown'}`);
      // Tool results should come in subsequent tool_result blocks
    } else if (block.type === 'tool_result') {
      // Tool result blocks might contain search results
      console.log(`📋 Found tool_result block`);
      if (block.content && typeof block.content === 'string') {
        resultText += block.content;
      } else if (Array.isArray(block.content)) {
        // Handle array of content blocks
        for (const contentBlock of block.content) {
          if (contentBlock.type === 'text') {
            resultText += contentBlock.text;
          }
        }
      }
    } else {
      // Unknown block type - log for debugging
      console.log(`⚠️ Unknown block type: ${(block as any).type || 'undefined'}`);
    }
  }

  // Log the raw response for debugging
  if (!resultText || resultText.trim().length === 0) {
    console.error('❌ Empty response from recipe search');
    console.error('Response content structure:', JSON.stringify(response.content, null, 2));
    console.error('Response object keys:', Object.keys(response));
    throw new Error('Empty response from recipe search API');
  }

  console.log(`📄 Raw search response (first 500 chars): ${resultText.substring(0, 500)}`);
  console.log(`📄 Full response length: ${resultText.length} characters`);

  try {
    // Remove markdown code blocks if present
    const cleanedText = resultText.replace(/```json\n?|\n?```/g, '').trim();
    
    // Try to parse as JSON first
    const parsed = JSON.parse(cleanedText);
    
    // Handle both array and single object responses
    const results: RecipeSearchResult[] = Array.isArray(parsed) ? parsed : [parsed];
    
    // Validate each result
    const validResults = results.filter(r => r && r.url && r.title);
    
    if (validResults.length === 0) {
      console.warn('⚠️ Parsed JSON but no valid results found');
      console.warn('Parsed results:', JSON.stringify(results, null, 2));
      throw new Error('No valid recipe results found in parsed JSON');
    }

    console.log(`✅ Found ${validResults.length} recipe options from different websites`);
    return validResults;
  } catch (parseError) {
    // Fallback: Try to extract URLs from text
    console.warn('⚠️ Failed to parse search result as JSON, attempting URL extraction');
    console.warn('Parse error:', parseError instanceof Error ? parseError.message : String(parseError));
    console.warn('Response text:', resultText.substring(0, 1000));
    
    // Try multiple URL patterns - be more aggressive in extraction
    const urlPatterns = [
      /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,  // Standard URL pattern
      /https?:\/\/[^\s,;)]+/g,            // More permissive
      /https?:\/\/[^\s"']+/g,             // Even more permissive (stop at quotes)
      /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"{}|\\^`[\]]*)?/g  // Domain pattern with path
    ];
    
    let urlMatches: string[] = [];
    for (const pattern of urlPatterns) {
      const matches = resultText.match(pattern);
      if (matches && matches.length > 0) {
        urlMatches = matches;
        console.log(`🔍 Found ${matches.length} URLs with pattern: ${pattern}`);
        break;
      }
    }
    
    // Clean up URLs (remove trailing punctuation that might have been captured)
    urlMatches = urlMatches.map(url => {
      // Remove trailing punctuation that's not part of the URL
      return url.replace(/[.,;:!?]+$/, '');
    }).filter(url => {
      // Basic URL validation
      try {
        new URL(url.startsWith('http') ? url : `https://${url}`);
        return true;
      } catch {
        return false;
      }
    });
    
    if (urlMatches && urlMatches.length > 0) {
      // Filter to only recipe-like URLs (contain recipe, cooking, food keywords or common recipe sites)
      // But be less strict - if we have URLs, use them
      const recipeUrls = urlMatches.filter(url => {
        const lowerUrl = url.toLowerCase();
        // Accept if it's from a known recipe site OR contains recipe keywords
        return lowerUrl.includes('recipe') || 
               lowerUrl.includes('cooking') || 
               lowerUrl.includes('food') ||
               lowerUrl.includes('/recipes/') ||
               /(food52|seriouseats|allrecipes|foodnetwork|tasty|bonappetit|epicurious|thekitchn|bbcgoodfood|jamieoliver|delish|tasteofhome|simplyrecipes|minimalistbaker|cookieandkate|pinchofyum)\.com/.test(lowerUrl);
      });
      
      // Use recipe URLs if found, otherwise use any URLs (they might still be recipes)
      const finalUrls = recipeUrls.length > 0 ? recipeUrls : urlMatches.slice(0, 5);
      
      console.log(`✅ Extracted ${finalUrls.length} URLs from text fallback (${recipeUrls.length} recipe-like)`);
      return finalUrls.map(url => {
        const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
        return {
          title: searchQuery,
          url: cleanUrl,
          snippet: 'Recipe found via web search'
        };
      });
    }

    console.error('❌ No recipe URL found in search results');
    console.error('Full response text:', resultText);
    throw new Error('No recipe URL found in search results. The search API may have returned an unexpected format.');
  }
}

