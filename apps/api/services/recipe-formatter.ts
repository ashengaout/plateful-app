import Anthropic from '@anthropic-ai/sdk';
import type { RecipeData, FoodProfile } from '@plateful/shared';

/**
 * Format scraped recipe content into structured JSON
 */
export async function formatRecipe(scrapedContent: string, sourceUrl: string, profile?: FoodProfile | null): Promise<RecipeData> {
  // Initialize client with current environment variables
  const client = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY 
  });

  // Build profile compliance check
  let complianceNote = '';
  if (profile) {
    const restrictions: string[] = [];
    if (profile.allergens && profile.allergens.length > 0) {
      restrictions.push(`allergens: ${profile.allergens.join(', ')}`);
    }
    if (profile.restrictions && profile.restrictions.length > 0) {
      restrictions.push(`restrictions: ${profile.restrictions.join(', ')}`);
    }
    if (restrictions.length > 0) {
      complianceNote = `\n\nIMPORTANT COMPLIANCE CHECK:\nVerify this recipe does NOT contain: ${restrictions.join(', ')}. If it does, note this in the description.`;
    }
    
    const likesNote = profile.likes && profile.likes.length > 0
      ? `\n\nUSER PREFERENCES: The user likes: ${profile.likes.join(', ')}. If this recipe aligns with any of these preferences, you may mention it briefly in the description.`
      : '';
    complianceNote += likesNote;
  }

  // Detect if this is conversation-based content (for edited recipes)
  const isConversationBased = scrapedContent.includes('Modified Recipe Conversation:') || 
                               scrapedContent.includes('User:') || 
                               scrapedContent.includes('Assistant:');
  
  let prompt: string;
  
  if (isConversationBased) {
    // Specialized prompt for conversation-based recipe editing
    prompt = `You are a recipe formatter. Your task is to extract the FINAL, MODIFIED recipe from a conversation where a user edited a recipe with an AI assistant.

IMPORTANT RULES:
1. Extract the MODIFIED recipe as described in the conversation - this is an edited version of the original
2. Use the Assistant's final description of the modified recipe
3. Include all changes mentioned in the conversation (e.g., ingredient substitutions, quantity adjustments, spice level changes)
4. If serving count is not mentioned in the conversation, use the original recipe's serving count
5. If nutrition data is missing, estimate it and mark as "(estimated by AI)"
6. Calories MUST be per portion, not total
7. Keep ingredients and instructions concise and clear
8. The conversation shows the ORIGINAL recipe and then the MODIFICATIONS - extract the FINAL modified recipe

CRITICAL INGREDIENT EXTRACTION RULES:
- Each ingredient must be COMPLETE and MEANINGFUL - never split compound ingredients
- Examples of CORRECT extraction:
  * "2 cups boiling water" → ["2 cups boiling water"] (NOT ["2 cups boiling", "water"])
  * "1/2 cup chopped onions" → ["1/2 cup chopped onions"] (NOT ["1/2 cup", "chopped", "onions"])
  * "3 cloves garlic, minced" → ["3 cloves garlic, minced"] (NOT ["3 cloves", "garlic", "minced"])
- Preparation methods (boiling, chopped, diced, minced, etc.) should be part of the ingredient name or in notes, NEVER separate ingredients
- If an ingredient has no explicit quantity (e.g., "Rice noodles", "Shrimp"), keep it as a descriptive item without adding quantities
- Each ingredient string should be a complete, standalone item that makes sense on its own${complianceNote}

Conversation content:
---
${scrapedContent.substring(0, 8000)}
---

Return a JSON object with this EXACT structure containing the MODIFIED recipe:
{
  "title": "Recipe name (may be modified)",
  "description": "Brief description of the dish reflecting the modifications",
  "portions": "Number of servings (e.g., '4 servings' or '4 servings (estimated by AI)')",
  "ingredients": ["modified ingredient 1", "modified ingredient 2", ...],
  "instructions": ["modified step 1", "modified step 2", ...],
  "nutrition": {
    "calories_per_portion": "XXX kcal or XXX kcal (estimated by AI)",
    "protein": "XXg or XXg (estimated by AI)",
    "carbs": "XXg or XXg (estimated by AI)",
    "fat": "XXg or XXg (estimated by AI)"
  },
  "sourceUrl": "${sourceUrl}",
  "imageUrl": "optional image URL if available"
}

Return ONLY the JSON object, no other text.`;
  } else {
    // Original prompt for scraped web content
    prompt = `You are a recipe formatter. Your task is to extract and structure recipe information from scraped web content.

IMPORTANT RULES:
1. Do NOT generate or invent recipes
2. Extract ONLY information present in the source content
3. Remove ads, stories, commentary, and irrelevant text
4. If serving count is missing, estimate it and mark as "(estimated by AI)"
5. If nutrition data is missing, estimate it and mark as "(estimated by AI)"
6. Calories MUST be per portion, not total
7. Keep ingredients and instructions concise and clear

CRITICAL INGREDIENT EXTRACTION RULES:
- Each ingredient must be COMPLETE and MEANINGFUL - never split compound ingredients
- Examples of CORRECT extraction:
  * "2 cups boiling water" → ["2 cups boiling water"] (NOT ["2 cups boiling", "water"])
  * "1/2 cup chopped onions" → ["1/2 cup chopped onions"] (NOT ["1/2 cup", "chopped", "onions"])
  * "3 cloves garlic, minced" → ["3 cloves garlic, minced"] (NOT ["3 cloves", "garlic", "minced"])
- Preparation methods (boiling, chopped, diced, minced, etc.) should be part of the ingredient name or in notes, NEVER separate ingredients
- If an ingredient has no explicit quantity (e.g., "Rice noodles", "Shrimp"), keep it as a descriptive item without adding quantities
- Each ingredient string should be a complete, standalone item that makes sense on its own${complianceNote}

Scraped content from ${sourceUrl}:
---
${scrapedContent.substring(0, 8000)}
---

Return a JSON object with this EXACT structure:
{
  "title": "Recipe name",
  "description": "Brief description of the dish",
  "portions": "Number of servings (e.g., '4 servings' or '4 servings (estimated by AI)')",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "instructions": ["step 1", "step 2", ...],
  "nutrition": {
    "calories_per_portion": "XXX kcal or XXX kcal (estimated by AI)",
    "protein": "XXg or XXg (estimated by AI)",
    "carbs": "XXg or XXg (estimated by AI)",
    "fat": "XXg or XXg (estimated by AI)"
  },
  "sourceUrl": "${sourceUrl}",
  "imageUrl": "optional image URL if available"
}

Return ONLY the JSON object, no other text.`;
  }

  // Add timeout wrapper for Anthropic API call (60 seconds)
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Recipe formatting timed out after 60 seconds')), 60000);
  });

  const response = await Promise.race([
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: prompt
      }]
    }),
    timeoutPromise
  ]);

  // Extract JSON from response
  let resultText = '';
  for (const block of response.content) {
    if (block.type === 'text') {
      resultText += block.text;
    }
  }

  try {
    // Remove markdown code blocks if present
    const cleanedText = resultText.replace(/```json\n?|\n?```/g, '').trim();
    const recipeData: RecipeData = JSON.parse(cleanedText);
    
    // Validate required fields
    if (!recipeData.title || !recipeData.ingredients || !recipeData.instructions || !recipeData.portions) {
      throw new Error('Missing required recipe fields');
    }

    // Ensure sourceUrl is set
    recipeData.sourceUrl = sourceUrl;

    // Ensure nutrition object exists
    if (!recipeData.nutrition) {
      recipeData.nutrition = {
        calories_per_portion: 'Not available (estimated by AI)'
      };
    }

    return recipeData;
  } catch (error) {
    console.error('Failed to parse formatted recipe:', resultText);
    throw new Error('Failed to format recipe data');
  }
}

