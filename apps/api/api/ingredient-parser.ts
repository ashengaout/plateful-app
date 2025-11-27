import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import type { GroceryItem } from '@plateful/shared';

const app = new Hono();

// Initialize Anthropic client
const client = new Anthropic({ 
  apiKey: process.env.ANTHROPIC_API_KEY 
});

/**
 * Parse ingredients using AI to fix formatting issues
 * POST /parse-ingredients
 * Body: { ingredients: string[] }
 * Returns: { parsed: Array<Omit<GroceryItem, 'id' | 'userID' | 'listID' | 'completed' | 'createdAt' | 'updatedAt'>> }
 */
app.post('/', async (c) => {
  try {
    const body = await c.req.json<{ ingredients: string[] }>();
    const { ingredients } = body;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return c.json({ error: 'ingredients array is required' }, 400);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
    }

    console.log(`🤖 Parsing ${ingredients.length} ingredients with AI...`);

    // Build prompt for AI
    const prompt = `You are an ingredient parser. Parse each ingredient string into a clean, structured format.

IMPORTANT RULES:
1. Extract clean ingredient name (remove weird formatting like "Ginger, 2 of" → "ginger")
2. Extract quantity as a number (handle fractions like 1/2, 2 1/2, etc.)
3. Extract and normalize unit (tbsp, tsp, cups, oz, lb, g, kg, ml, l, pieces, cloves, etc.)
4. Put preparation notes (chopped, diced, minced, etc.) in the notes field
5. Fix incomplete items - ensure ingredient name is complete and meaningful
6. Handle "X of Y" patterns properly (e.g., "2 of ginger" → quantity: 2, unit: "pieces", name: "ginger")
7. Remove any leftover numbers, fractions, or dashes from ingredient names
8. If quantity is missing, default to 1
9. CRITICAL UNIT HANDLING:
   - Only use "pieces" when there's an EXPLICIT count in the original ingredient (e.g., "2 shrimp" → quantity: 2, unit: "pieces")
   - For descriptive ingredients WITHOUT explicit quantities or units (e.g., "Shrimp", "rice noodles", "coconut oil"), use an EMPTY STRING ("") for the unit, NOT "pieces"
   - Examples:
     * "Shrimp" → name: "shrimp", quantity: 1, unit: "" (empty string)
     * "rice noodles" → name: "rice noodles", quantity: 1, unit: "" (empty string)
     * "2 shrimp" → name: "shrimp", quantity: 2, unit: "pieces"
     * "1 cup rice noodles" → name: "rice noodles", quantity: 1, unit: "cup"
   - If the ingredient is just a name with no quantity or unit mentioned, leave unit as empty string ""

CRITICAL: DETECT AND FIX INCOMPLETE INGREDIENT NAMES
- If an ingredient name is just a preparation method (e.g., "boiling", "sliced", "minced", "chopped"), it's likely incomplete
- Common incomplete patterns to detect:
  * "boiling" → likely part of a previous ingredient or should be in notes (DO NOT infer "water")
  * "sliced" → likely part of a previous ingredient or should be in notes
  * "minced" → likely part of a previous ingredient or should be in notes
  * "chopped" → likely part of a previous ingredient or should be in notes
- If you detect an incomplete ingredient, try to infer the complete name from context
- If you cannot determine the complete name, mark it clearly in notes or skip it
- Ingredient names must be complete nouns (e.g., "onion", "garlic"), not just adjectives or verbs

Ingredient strings to parse:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

Return a JSON array with this EXACT structure for each ingredient:
{
  "name": "clean ingredient name (must be a complete, meaningful noun)",
  "quantity": number,
  "unit": "normalized unit string or empty string \"\" if no unit",
  "category": null or undefined,
  "notes": "preparation notes or empty string"
}

Return ONLY the JSON array, no other text.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    // Extract JSON from response
    let resultText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        resultText += block.text;
      }
    }

    // Remove markdown code blocks if present
    const cleanedText = resultText.replace(/```json\n?|\n?```/g, '').trim();

    let parsed: Array<Omit<GroceryItem, 'id' | 'userID' | 'listID' | 'completed' | 'createdAt' | 'updatedAt'>>;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('AI response text:', resultText);
      return c.json({ 
        error: 'Failed to parse AI response',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      }, 500);
    }

    // Validate parsed results
    if (!Array.isArray(parsed)) {
      return c.json({ error: 'AI returned invalid format (expected array)' }, 500);
    }

    // Ensure all items have required fields and validate ingredient names
    const preparationWords = new Set([
      'boiling', 'sliced', 'minced', 'chopped', 'diced', 'grated', 'crushed',
      'ground', 'whole', 'pieces', 'cubed', 'julienned', 'shredded', 'pureed',
      'mashed', 'whipped', 'beaten', 'separated', 'strained', 'drained',
      'peeled', 'seeded', 'stemmed', 'trimmed', 'cleaned', 'washed'
    ]);

    // Filter out water and common items everyone has
    const commonItems = new Set(['water', 'salt', 'pepper', 'black pepper']);

    const validated = parsed
      .map((item: any, index: number) => {
        let name = item.name || 'Unknown';
        const nameLower = name.toLowerCase().trim();
        
        // Filter out water and common items
        if (commonItems.has(nameLower)) {
          return null; // Will be filtered out
        }
        
        // Check if name is just a preparation word (incomplete ingredient)
        if (preparationWords.has(nameLower) && nameLower.length < 10) {
          // Don't infer water - just mark as unknown or skip
          return {
            name: 'Unknown ingredient',
            quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
            unit: item.unit || '',
            category: item.category || undefined,
            notes: item.notes ? `${nameLower}, ${item.notes}` : nameLower,
          };
        }
        
        // Ensure unit is empty string if it's "pieces" but there's no explicit count
        // If the original ingredient didn't have a number, don't use "pieces"
        let unit = item.unit || '';
        if (unit === 'pieces' && item.quantity === 1) {
          // Check if the original ingredient string had a number
          const originalIng = ingredients[index];
          // If original didn't have a number, remove "pieces"
          if (originalIng && !/\d/.test(originalIng)) {
            unit = '';
          }
        }
        
        return {
          name,
          quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
          unit: unit,
          category: item.category || undefined,
          notes: item.notes || '',
        };
      })
      .filter((item: any) => item !== null); // Remove filtered items

    console.log(`✅ Successfully parsed ${validated.length} ingredients`);

    return c.json({ parsed: validated });

  } catch (error: any) {
    console.error('Ingredient parser error:', error);
    return c.json({ 
      error: 'Failed to parse ingredients',
      details: error.message || 'Unknown error'
    }, 500);
  }
});

export default app;

