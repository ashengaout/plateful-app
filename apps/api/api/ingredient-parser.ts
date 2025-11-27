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
9. If unit is missing for count-based items, use "pieces" as default

CRITICAL: DETECT AND FIX INCOMPLETE INGREDIENT NAMES
- If an ingredient name is just a preparation method (e.g., "boiling", "sliced", "minced", "chopped"), it's likely incomplete
- Common incomplete patterns to detect:
  * "boiling" → likely should be "boiling water" (check context or previous ingredients)
  * "sliced" → likely part of a previous ingredient or should be in notes
  * "minced" → likely part of a previous ingredient or should be in notes
  * "chopped" → likely part of a previous ingredient or should be in notes
- If you detect an incomplete ingredient, try to infer the complete name from context
- If you cannot determine the complete name, mark it clearly in notes or skip it
- Ingredient names must be complete nouns (e.g., "water", "onion", "garlic"), not just adjectives or verbs

Ingredient strings to parse:
${ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n')}

Return a JSON array with this EXACT structure for each ingredient:
{
  "name": "clean ingredient name (must be a complete, meaningful noun)",
  "quantity": number,
  "unit": "normalized unit string",
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

    const validated = parsed.map((item: any) => {
      let name = item.name || 'Unknown';
      const nameLower = name.toLowerCase().trim();
      
      // Check if name is just a preparation word (incomplete ingredient)
      if (preparationWords.has(nameLower) && nameLower.length < 10) {
        // Try to infer from context - if it's "boiling" with a unit like "cups", it's likely "boiling water"
        if (item.unit && (item.unit.includes('cup') || item.unit.includes('ml') || item.unit.includes('l'))) {
          name = 'water';
          // Add the preparation method to notes
          const notes = item.notes ? `${nameLower}, ${item.notes}` : nameLower;
          return {
            name,
            quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
            unit: item.unit || '',
            category: item.category || undefined,
            notes,
          };
        }
        // Otherwise, mark as unknown and put preparation word in notes
        return {
          name: 'Unknown ingredient',
          quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
          unit: item.unit || '',
          category: item.category || undefined,
          notes: item.notes ? `${nameLower}, ${item.notes}` : nameLower,
        };
      }
      
      return {
        name,
        quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
        unit: item.unit || '',
        category: item.category || undefined,
        notes: item.notes || '',
      };
    });

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

