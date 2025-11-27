import Anthropic from '@anthropic-ai/sdk';
import type { RecipeSearchResult, FoodProfile } from '@plateful/shared';

/**
 * Search for recipes using Anthropic's web search
 * Returns multiple recipe options from different websites
 */
export async function searchRecipe(searchQuery: string, profile?: FoodProfile | null): Promise<RecipeSearchResult[]> {
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
  let restrictionsNote = '';
  if (profile) {
    const restrictions: string[] = [];
    if (profile.allergens && profile.allergens.length > 0) {
      restrictions.push(`allergen-free: ${profile.allergens.join(', ')}`);
    }
    if (profile.restrictions && profile.restrictions.length > 0) {
      restrictions.push(`without: ${profile.restrictions.join(', ')}`);
    }
    if (restrictions.length > 0) {
      restrictionsNote = `\n\nIMPORTANT: The recipe must be ${restrictions.join(', ')}. Filter out any recipes that contain these.`;
    }
  }

  // Build cooking proficiency context for search
  let proficiencyNote = '';
  if (profile?.cookingProficiency) {
    if (profile.cookingProficiency === 1 || profile.cookingProficiency === 2) {
      // Levels 1-2: Emphasize simple, beginner-friendly recipes
      proficiencyNote = `\n\nIMPORTANT: Prioritize simple, beginner-friendly recipes with clear step-by-step instructions.`;
    } else if (profile.cookingProficiency === 4 || profile.cookingProficiency === 5) {
      // Levels 4-5: Prefer advanced techniques when available, but don't exclude simple recipes
      proficiencyNote = `\n\nNOTE: Prefer recipes with advanced techniques or complex methods when available, but simple recipes are acceptable if that's what the dish naturally is (e.g., grilled cheese sandwich).`;
    }
    // Level 3: No special context (neutral)
  }

  // Build equipment context for search
  let equipmentNote = '';
  if (profile) {
    if (profile.unavailableEquipment && profile.unavailableEquipment.length > 0) {
      equipmentNote = `\n\nCRITICAL: Do NOT return recipes that require: ${profile.unavailableEquipment.join(', ')}. These are hard filters - exclude any recipe that needs these.`;
    }
    if (profile.preferredEquipment && profile.preferredEquipment.length > 0) {
      const preferredNote = `\n\nPREFERENCE: Prefer recipes that use: ${profile.preferredEquipment.join(', ')}. This is a soft preference - still return other recipes if they're good matches.`;
      equipmentNote += preferredNote;
    }
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
          "thehealthyhunterblog.com" // Consistently returns 500 errors
        ],
        // Prefer reliable recipe sites
      }
    ],
    messages: [{
      role: "user",
      content: `Search for: ${modifiedSearchQuery}${restrictionsNote}${proficiencyNote}${equipmentNote}


Find a specific recipe page URL (not a homepage or category page) from any reliable cooking website.

IMPORTANT: Return a URL to a specific recipe page that contains ingredients and instructions, NOT a homepage or category listing page.

Return a JSON array with 3-5 different recipe options, each from a DIFFERENT website/domain.
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

  // Extract the response text
  let resultText = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      resultText += block.text;
    }
  }

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
      throw new Error('No valid recipe results found');
    }

    console.log(`✅ Found ${validResults.length} recipe options from different websites`);
    return validResults;
  } catch (parseError) {
    // Fallback: Try to extract URLs from text
    console.warn('Failed to parse search result as JSON, attempting URL extraction');
    
    const urlMatches = resultText.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/g);
    if (urlMatches && urlMatches.length > 0) {
      return urlMatches.map(url => ({
        title: searchQuery,
        url: url,
        snippet: 'Recipe found via web search'
      }));
    }

    throw new Error('No recipe URL found in search results');
  }
}

