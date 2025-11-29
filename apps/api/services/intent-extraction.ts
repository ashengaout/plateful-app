import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, IntentExtractionResult, FoodProfile } from '@plateful/shared';

/**
 * Extract the user's decided dish and generate a search query from the conversation
 */
export async function extractIntent(messages: ChatMessage[], profile?: FoodProfile | null): Promise<IntentExtractionResult> {
  // Initialize client with current environment variables
  const client = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY 
  });

  // Build conversation history
  const conversationText = messages
    .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
    .join('\n');

  // Build profile context if available
  let profileContext = '';
  if (profile) {
    const preferences: string[] = [];
    if (profile.likes && profile.likes.length > 0) {
      preferences.push(`Likes: ${profile.likes.join(', ')}`);
    }
    if (profile.dislikes && profile.dislikes.length > 0) {
      preferences.push(`Dislikes: ${profile.dislikes.join(', ')}`);
    }
    if (profile.allergens && profile.allergens.length > 0) {
      preferences.push(`Allergens to avoid: ${profile.allergens.join(', ')}`);
    }
    if (profile.restrictions && profile.restrictions.length > 0) {
      preferences.push(`Dietary restrictions: ${profile.restrictions.join(', ')}`);
    }
    
    if (preferences.length > 0) {
      profileContext = `\n\nUSER FOOD PREFERENCES:\n${preferences.join('\n')}\n\nNote: When generating the explanation, mention relevant preferences if they align with the dish being discussed. For example, if the user likes "spicy" and discusses a spicy dish, note this in the explanation.`;
    }
  }

  const prompt = `You are analyzing a conversation about food and meal planning. Based on the conversation below, determine the user's intent and categorize it into one of four levels.${profileContext}


Conversation:
${conversationText}

Please respond with a JSON object in this exact format:
{
  "dish": "Specific dish name OR broad category OR 'Kitchen utility question' OR 'Not food-related'",
  "searchQuery": "detailed search query for finding recipe OR 'Not applicable - kitchen utility' OR 'Not applicable - off-topic conversation'",
  "status": "off_topic" OR "kitchen_utility" OR "broad_category" OR "dish_type" OR "specific_dish" OR "fully_refined",
  "certaintyLevel": "low" OR "medium" OR "high",
  "explanation": "Short summary with core details like 'Chinese food with onions, noodles' or 'Pan-seared fish, spicy'"
}

INTENT LEVELS:
- off_topic: Conversation is NOT about cooking, food, recipes, or kitchen-related topics (cement, sports, weather, conversions, etc.)
- kitchen_utility: Kitchen questions without recipe intent (unit conversions, technique explanations, "what is braising?")
- broad_category: Cuisine type, flavor profile (Chinese food, Italian, spicy, comfort food, vegetarian)
- dish_type: General dish type without specific recipe name (Thai chicken stir-fry, Chinese noodles, pasta dishes)
- specific_dish: User mentioned a named dish (Kung Pao Chicken, lasagna, cheeseburger, pad thai)
- fully_refined: User mentioned a specific dish AND preferences/details (spicy Kung Pao, medium-rare burger, gluten-free pasta)

CERTAINTY LEVELS:
- low: broad_category OR dish_type status
- medium: specific_dish status  
- high: fully_refined status

IMPORTANT: Be AGGRESSIVE with status assignment for specific dish names:
- If user mentions a specific dish name in their FIRST message (like "drunken noodles", "pad thai", "Kung Pao Chicken"), immediately classify as specific_dish
- If user mentions a specific dish name AND preferences/details in their FIRST message (like "spicy drunken noodles", "vegetarian pad thai"), classify as fully_refined
- Don't wait for multiple messages - if the first user message contains a dish name, show the recipe button immediately
- Only be conservative if the user is clearly still exploring (e.g., "I'm thinking about Thai food" without naming a dish)

KITCHEN-RELATED TOPICS (ALLOWED):
- Cooking methods: braise, sauté, grill, bake, etc.
- Ingredients: when discussed in cooking context
- Kitchen equipment: when used in cooking context
- Food preparation techniques

OFF-TOPIC EXAMPLES (BLOCK):
- Unit conversions (12 floz in ml)
- Non-food topics (cement, sports, weather)
- General questions not related to cooking

KITCHEN UTILITY EXAMPLES (ALLOW CONVERSATION, NO RECIPE BUTTON):
- "What is braising?"
- "How do I convert 12 floz to ml?"
- "What's the difference between sauté and stir-fry?"

EXPLANATION EXAMPLES:
- "Chinese food" (for broad categories)
- "Chinese food with onions, noodles" (when ingredients mentioned)
- "Pan-seared fish, spicy" (when preferences specified)
- "Kitchen utility question" (for conversions, techniques)

STATUS EXAMPLES:
- "Thai food" → broad_category (even if AI asks questions)
- "Thai chicken stir-fry" → dish_type (general dish type, not named recipe)
- "I want Pad Thai" → specific_dish (named recipe) - IMMEDIATELY, don't wait
- "drunken noodles" → specific_dish (named recipe) - IMMEDIATELY, don't wait
- "I want drunken noodles" → specific_dish (named recipe) - IMMEDIATELY, don't wait
- "Spicy Pad Thai with extra peanuts" → fully_refined (named recipe + preferences) - IMMEDIATELY
- "spicy drunken noodles" → fully_refined (named recipe + preferences) - IMMEDIATELY
- "What is braising?" → kitchen_utility
- "Tell me about cement" → off_topic

CRITICAL RULE: If the user's FIRST message contains a recognizable dish name (pad thai, drunken noodles, kung pao chicken, lasagna, cheeseburger, etc.), classify as specific_dish or fully_refined IMMEDIATELY. Don't wait for follow-up messages or AI questions.

IMPORTANT RULES:
- If user mentions a dish name in their FIRST message, they HAVE decided on that dish - classify immediately as specific_dish or fully_refined
- Don't wait for multiple messages - be aggressive about detecting dish names
- Common dish names to recognize immediately: pad thai, drunken noodles, kung pao chicken, lasagna, cheeseburger, pizza, pasta, curry, stir-fry, ramen, pho, tacos, burritos, sushi, etc.
- If user mentions a dish and answers questions about it, they HAVE decided on that dish
- Broad categories like "Chinese food" are valid and should allow recipe search
- Only block conversations that are completely unrelated to cooking/food
- Kitchen utility questions should allow conversation but not show recipe button
- The searchQuery should be concise and optimized for web search (e.g., "Chinese recipes", "Italian pasta recipes", "braising recipes", "drunken noodles recipe")
- Avoid verbose search queries with pending details - keep them simple and actionable
- The explanation should be SHORT but include core details - like "Chinese food with onions, noodles" or "Pan-seared fish, spicy" - give a hint of what's being considered
- DO NOT write long explanations about AI behavior or user analysis - just the food details
- Return ONLY the JSON object, no other text`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
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

  // Parse the JSON response
  try {
    // Remove markdown code blocks if present
    const cleanedText = resultText.replace(/```json\n?|\n?```/g, '').trim();
    const result: any = JSON.parse(cleanedText);
    
    if (!result.dish || !result.searchQuery) {
      throw new Error('Invalid intent extraction result');
    }

    // Handle both old and new format - be more permissive
    const intentResult: IntentExtractionResult = {
      dish: result.dish,
      searchQuery: result.searchQuery,
      status: result.status || (
        result.dish === 'Not yet decided' || 
        result.dish === 'Unable to provide - user has not selected a specific dish' ||
        result.dish === 'Not food-related' ||
        result.searchQuery === 'Unable to provide - user has not selected a specific dish' ||
        result.searchQuery === 'Not applicable - off-topic conversation'
          ? 'off_topic' 
          : result.dish.includes('food') || result.dish.includes('cuisine') || result.dish.includes('style')
            ? 'broad_category'
            : 'specific_dish'
      ),
      certaintyLevel: result.certaintyLevel || (
        result.status === 'broad_category' || result.status === 'dish_type' ? 'low' :
        result.status === 'specific_dish' ? 'medium' :
        result.status === 'fully_refined' ? 'high' : 'low'
      ),
      explanation: result.explanation || `${result.dish}`
    };

    console.log(`🧠 Intent extraction result:`, intentResult);
    return intentResult;
  } catch (error) {
    console.error('Failed to parse intent extraction result:', resultText);
    throw new Error('Failed to extract intent from conversation');
  }
}

