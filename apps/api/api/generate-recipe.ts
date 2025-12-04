import { Hono } from 'hono';
import { getContainer, generateId, isCosmosAvailable } from '../lib/cosmos';
import { extractIntent } from '../services/intent-extraction';
import { searchRecipe } from '../services/recipe-search';
import { scrapeRecipeContent } from '../services/recipe-scraper';
import { formatRecipe } from '../services/recipe-formatter';
import { substituteIngredients, detectDisallowedIngredients } from '../services/ingredient-substitution';
import { requiresUnavailableEquipment } from '../services/equipment-filter';
import type { ChatMessage, ChatConversation, Recipe, RecipeGenerateRequest, FoodProfile, RecipeSearchResult } from '@plateful/shared';

const app = new Hono();


/**
 * Generate a recipe from a conversation
 * POST /generate-recipe
 * 
 * This endpoint implements the full flow:
 * 1. Fetch conversation messages
 * 2. Extract intent (dish + search query)
 * 3. Search for recipe URL
 * 4. Scrape recipe content
 * 5. Format into structured JSON
 * 6. Store in Cosmos DB
 */
app.post('/', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Recipe generation service not available' }, 503);
  }

  try {
    const body = await c.req.json<RecipeGenerateRequest & { includePantry?: boolean }>();
    const { conversationID, userID, includePantry } = body;

    if (!conversationID || !userID) {
      return c.json({ error: 'conversationID and userID are required' }, 400);
    }

    console.log(`🔄 Starting recipe generation for conversation ${conversationID}`);

    // Step 0: Fetch user profile (if available)
    let profile: FoodProfile | null = null;
    const profileContainer = getContainer('userProfiles');
    if (profileContainer) {
      try {
        const { resource } = await profileContainer.item(userID, userID).read<FoodProfile>();
        profile = resource || null;
        if (profile) {
          console.log(`✅ User profile found with ${profile.likes.length} likes, ${profile.allergens.length} allergens`);
          if (profile.cookingProficiency) {
            console.log(`👨‍🍳 Cooking proficiency: ${profile.cookingProficiency} (${['Beginner', 'Novice', 'Intermediate', 'Experienced', 'Advanced'][profile.cookingProficiency - 1]})`);
          }
        }
      } catch (error) {
        console.log(`ℹ️ No profile found for user ${userID}, proceeding without preferences`);
      }
    }

    // Step 1: Fetch conversation messages
    const messagesContainer = getContainer('chatMessages');
    if (!messagesContainer) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resources: messages } = await messagesContainer.items
      .query<ChatMessage>({
        query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex ASC',
        parameters: [{ name: '@conversationID', value: conversationID }],
      })
      .fetchAll();

    if (messages.length === 0) {
      return c.json({ error: 'No messages found in conversation' }, 404);
    }

    console.log(`📝 Fetched ${messages.length} messages`);

    // Step 1.5: Fetch pantry items if includePantry is true
    let pantryItems: any[] = [];
    if (includePantry) {
      const pantryContainer = getContainer('pantries');
      if (pantryContainer) {
        try {
          const { resources } = await pantryContainer.items
            .query({
              query: 'SELECT * FROM c WHERE c.userID = @userID',
              parameters: [{ name: '@userID', value: userID }],
            })
            .fetchAll();
          pantryItems = resources || [];
          if (pantryItems.length > 0) {
            console.log(`📦 Found ${pantryItems.length} pantry items to inspire recipe search`);
          }
        } catch (error) {
          console.log('Could not load pantry items:', error);
        }
      }
    }

    // Step 2: Extract intent
    console.log(`🧠 Extracting intent from conversation...`);
    const intent = await extractIntent(messages, profile);
    console.log(`✅ Intent extracted: ${intent.dish} (status: ${intent.status})`);
    
    // Enhance search query with pantry ingredients ONLY if:
    // 1. Pantry items are available
    // 2. Search query exists and is not "Not applicable"
    // 3. Intent status is broad_category or dish_type (not already a specific dish)
    // This prevents making search queries too specific when a dish is already decided
    if (pantryItems.length > 0 && 
        intent.searchQuery && 
        !intent.searchQuery.includes('Not applicable') &&
        (intent.status === 'broad_category' || intent.status === 'dish_type')) {
      const ingredientNames = pantryItems.map(item => item.name).join(' ');
      // Add pantry ingredients to search query to prioritize recipes using them
      intent.searchQuery = `${intent.searchQuery} with ${ingredientNames}`;
      console.log(`📦 Enhanced search query with pantry ingredients: ${intent.searchQuery}`);
    } else if (pantryItems.length > 0 && (intent.status === 'specific_dish' || intent.status === 'fully_refined')) {
      console.log(`📦 Skipping pantry enhancement - intent is already a specific dish: ${intent.dish}`);
    }

    // Check if conversation is off-topic
    if (intent.status === 'off_topic') {
      console.log(`🚫 Off-topic conversation detected`);
      return c.json({ 
        error: 'Off-topic conversation',
        message: 'This conversation isn\'t about cooking or recipes. Please ask about a dish or cuisine you\'d like to make.',
        intent
      }, 400);
    }

    // All other statuses (broad_category, specific_dish, fully_refined) allow search
    console.log(`✅ Intent status: ${intent.status} - proceeding with recipe generation`);

    // Update conversation with extracted intent
    const conversationContainer = getContainer('chatConversations');
    if (conversationContainer) {
      const { resource: conversation } = await conversationContainer
        .item(conversationID, conversationID)
        .read<ChatConversation>();

      if (conversation) {
        conversation.decidedDish = intent.dish;
        conversation.searchQuery = intent.searchQuery;
        conversation.status = 'decided';
        conversation.updatedAt = new Date().toISOString();
        await conversationContainer.item(conversationID, conversationID).replace(conversation);
      }
    }

    // Step 3: Search for recipes (multiple options)
    // Always try strict search first (filter out allergens/restrictions), then relaxed if needed
    console.log(`🔍 Searching for recipes: ${intent.searchQuery}`);
    let searchResults: RecipeSearchResult[] = [];
    
    // Only use profile if user has premium subscription
    const profileForSearch = profile && profile.isPremium ? profile : null;
    
    try {
      // First try strict search (filter out recipes with allergens/restrictions) - only if premium
      searchResults = await searchRecipe(intent.searchQuery, profileForSearch, false);
      console.log(`✅ Found ${searchResults.length} recipe options (strict search - no allergens)`);
    } catch (searchError) {
      console.warn('⚠️ Strict search found no recipes matching restrictions, trying relaxed search...');
      
      // If strict search fails, try relaxed search (get any recipe - we'll substitute allergens)
      // Only check restrictions if user is premium
      const hasRestrictions = profile && profile.isPremium && (profile.allergens?.length > 0 || profile.restrictions?.length > 0);
      
      if (hasRestrictions) {
        try {
          searchResults = await searchRecipe(intent.searchQuery, profileForSearch, true);
          console.log(`✅ Found ${searchResults.length} recipe options (relaxed search - will auto-substitute allergens)`);
        } catch (relaxedError) {
          console.error('❌ Both strict and relaxed searches failed:', relaxedError);
          return c.json({ 
            error: 'Failed to generate recipe',
            details: relaxedError instanceof Error ? relaxedError.message : 'No recipe URL found in search results',
            message: 'Unable to find recipes for this dish. Please try rephrasing your request or asking about a different dish.'
          }, 500);
        }
      } else {
        // No restrictions, so strict search failure is a real failure
        console.error('❌ Recipe search failed:', searchError);
        return c.json({ 
          error: 'Failed to generate recipe',
          details: searchError instanceof Error ? searchError.message : 'No recipe URL found in search results',
          message: 'Unable to find recipes for this dish. Please try rephrasing your request or asking about a different dish.'
        }, 500);
      }
    }
    
    if (!searchResults || searchResults.length === 0) {
      // If strict search returned empty, try relaxed
      // Only check restrictions if user is premium
      const hasRestrictions = profile && profile.isPremium && (profile.allergens?.length > 0 || profile.restrictions?.length > 0);
      const profileForSearch = profile && profile.isPremium ? profile : null;
      
      if (hasRestrictions) {
        try {
          console.log('⚠️ Strict search returned no results, trying relaxed search...');
          searchResults = await searchRecipe(intent.searchQuery, profileForSearch, true);
          console.log(`✅ Found ${searchResults.length} recipe options (relaxed search - will auto-substitute allergens)`);
        } catch (relaxedError) {
          console.error('❌ Relaxed search also failed:', relaxedError);
          return c.json({ 
            error: 'Failed to generate recipe',
            details: 'No recipe URL found in search results',
            message: 'Unable to find recipes for this dish. Please try rephrasing your request or asking about a different dish.'
          }, 500);
        }
      } else {
        console.error('❌ No search results returned');
        return c.json({ 
          error: 'Failed to generate recipe',
          details: 'No recipe URL found in search results',
          message: 'Unable to find recipes for this dish. Please try rephrasing your request or asking about a different dish.'
        }, 500);
      }
    }

    // Preferred equipment feature has been removed - no ranking needed

    // Step 4: Try scraping each recipe URL until one succeeds
    console.log(`📄 Attempting to scrape recipe content...`);
    let recipeData;
    let successfulUrl: string | null = null;
    let lastError: Error | null = null;
    
    for (let i = 0; i < searchResults.length; i++) {
      const searchResult = searchResults[i];
      const domain = new URL(searchResult.url).hostname;
      console.log(`\n🔄 Trying recipe ${i + 1}/${searchResults.length}: ${searchResult.title} (${domain})`);
      
      try {
        const scrapeResult = await scrapeRecipeContent(searchResult.url, true);
        
        // Validate that we got meaningful content
        if (!scrapeResult.content || scrapeResult.content.length < 200) {
          throw new Error(`Scraped content too short (${scrapeResult.content?.length || 0} chars), likely failed`);
        }
        
        console.log(`✅ Successfully scraped ${scrapeResult.content.length} characters from ${domain}`);
        if (scrapeResult.imageUrl) {
          console.log(`✅ Extracted image: ${scrapeResult.imageUrl}`);
        }

        // Step 5: Format recipe
        console.log(`🎨 Formatting recipe data...`);
        try {
          // Only pass profile if user has premium subscription
          const profileForFormat = profile && profile.isPremium ? profile : null;
          recipeData = await formatRecipe(scrapeResult.content, searchResult.url, profileForFormat);
        } catch (formatError) {
          console.error(`❌ Failed to format recipe from ${domain}:`, formatError);
          lastError = formatError instanceof Error ? formatError : new Error(String(formatError));
          continue; // Try next recipe
        }
        
        // Add image URL if extracted
        if (scrapeResult.imageUrl) {
          recipeData.imageUrl = scrapeResult.imageUrl;
        }

        // Step 5.25: Check for unavailable equipment (hard filter)
        if (profile && requiresUnavailableEquipment(recipeData, profile)) {
          console.log(`🚫 Recipe requires unavailable equipment, skipping...`);
          lastError = new Error('Recipe requires unavailable equipment');
          continue; // Try next recipe
        }

        // Step 5.5: Check for disallowed ingredients and ALWAYS substitute (safety requirement)
        if (profile && (profile.allergens?.length > 0 || profile.restrictions?.length > 0)) {
          const disallowed = detectDisallowedIngredients(recipeData, profile);
          
          if (disallowed.length > 0) {
            console.log(`⚠️ Recipe contains ${disallowed.length} disallowed ingredient(s), attempting substitutions...`);
            
            try {
              const substitutionResult = await substituteIngredients(recipeData, profile);
              recipeData = substitutionResult.recipeData;
              
              if (substitutionResult.substitutions.length > 0) {
                console.log(`✅ Successfully substituted ${substitutionResult.substitutions.length} ingredient(s)`);
              } else {
                // Substitution was attempted but no substitutions were made - this is unsafe
                console.error(`❌ Substitution failed: detected ${disallowed.length} disallowed ingredients but no substitutions were made`);
                lastError = new Error('Unable to substitute disallowed ingredients');
                continue; // Skip this recipe - don't return unsafe recipe
              }
              
              // Double-check: verify no allergens remain after substitution
              const remainingDisallowed = detectDisallowedIngredients(recipeData, profile);
              if (remainingDisallowed.length > 0) {
                console.error(`❌ Substitution incomplete: ${remainingDisallowed.length} disallowed ingredients still present: ${remainingDisallowed.join(', ')}`);
                lastError = new Error('Substitution did not remove all disallowed ingredients');
                continue; // Skip this recipe - don't return unsafe recipe
              }
            } catch (subError) {
              console.error(`❌ Failed to substitute ingredients: ${subError instanceof Error ? subError.message : 'Unknown error'}`);
              // If substitution fails, try next recipe (don't return unsafe recipe)
              lastError = subError instanceof Error ? subError : new Error(String(subError));
              continue;
            }
          }
        }
        
        successfulUrl = searchResult.url;
        console.log(`✅ Recipe formatted successfully: ${recipeData.title}`);
        break; // Success! Exit the loop
        
      } catch (scrapeError) {
        lastError = scrapeError instanceof Error ? scrapeError : new Error(String(scrapeError));
        console.warn(`❌ Failed to scrape ${domain}: ${lastError.message}`);
        console.warn(`   URL: ${searchResult.url}`);
        console.warn(`   Error details:`, scrapeError);
        // Continue to next URL
      }
    }
    
    // If all URLs failed, throw error (don't create fallback)
    if (!recipeData || !successfulUrl) {
      const errorMessage = `Failed to scrape any of the ${searchResults.length} recipe URLs. Last error: ${lastError?.message || 'Unknown error'}`;
      console.error(`❌ ${errorMessage}`);
      console.error(`   Attempted URLs:`, searchResults.map(r => r.url));
      console.error(`   All errors logged above`);
      
      // Provide more helpful error message based on the type of failure
      let userMessage = 'Unable to access any recipe websites. Please try again later or with a different dish.';
      const errorMsg = lastError?.message || '';
      
      if (errorMsg.includes('formatting timed out') || errorMsg.includes('format recipe')) {
        userMessage = 'Recipe formatting took too long. The recipe content may be too complex. Please try again or with a different dish.';
      } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
        userMessage = 'Recipe websites are blocking access. Please try a different dish or try again later.';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Network')) {
        userMessage = 'Network timeout while accessing recipe websites. Please check your connection and try again.';
      } else if (errorMsg.includes('404')) {
        userMessage = 'Recipe pages not found. The search may have returned invalid links. Please try again.';
      }
      
      return c.json({ 
        error: 'Failed to retrieve recipe',
        message: userMessage,
        details: errorMessage,
        attemptedUrls: searchResults.map(r => r.url)
      }, 500);
    }

    // Step 6: Check for duplicate recipe
    const recipesContainer = getContainer('recipes');
    if (!recipesContainer) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const sourceUrlLower = successfulUrl.toLowerCase();
    const { resources: existingRecipes } = await recipesContainer.items
      .query<Recipe>({
        query: 'SELECT * FROM c WHERE c.userID = @userID AND c.sourceUrlLower = @sourceUrlLower',
        parameters: [
          { name: '@userID', value: userID },
          { name: '@sourceUrlLower', value: sourceUrlLower }
        ],
      })
      .fetchAll();

    let recipe: Recipe;

    if (existingRecipes.length > 0) {
      // Recipe already exists, link it to this conversation
      recipe = existingRecipes[0];
      console.log(`♻️ Recipe already exists, linking to conversation`);
      
      if (!recipe.conversationID) {
        recipe.conversationID = conversationID;
        await recipesContainer.item(recipe.id, userID).replace(recipe);
      }
    } else {
      // Create new recipe
      const recipeID = generateId('recipe');
      const now = new Date().toISOString();

      recipe = {
        id: recipeID,
        userID,
        recipeID,
        recipeNameLower: recipeData.title.toLowerCase(),
        sourceUrlLower,
        conversationID,
        recipeData,
        isSaved: false,
        createdAt: now,
        updatedAt: now,
        hasSubstitutions: (recipeData.substitutions && recipeData.substitutions.length > 0) || false,
      };

      await recipesContainer.items.create(recipe);
      console.log(`✅ Recipe stored with ID: ${recipeID}${recipe.hasSubstitutions ? ' (with substitutions)' : ''}`);
    }

    // Update conversation with recipe link
    if (conversationContainer) {
      const { resource: conversation } = await conversationContainer
        .item(conversationID, conversationID)
        .read<ChatConversation>();

      if (conversation) {
        conversation.recipeID = recipe.recipeID;
        conversation.status = 'recipe_found';
        conversation.updatedAt = new Date().toISOString();
        await conversationContainer.item(conversationID, conversationID).replace(conversation);
      }
    }

    console.log(`🎉 Recipe generation complete!`);

    // Find the successful search result for the response
    const successfulSearchResult = searchResults.find(r => r.url === successfulUrl) || searchResults[0];

    return c.json({ 
      recipe,
      intent,
      searchResult: successfulSearchResult
    }, 201);

  } catch (error) {
    console.error('❌ Recipe generation error:', error);
    return c.json({ 
      error: 'Failed to generate recipe',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * Get recipes for a user
 * GET /recipes/user/:userID
 */
app.get('/user/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Recipe service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const container = getContainer('recipes');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Support filtering by saved status
    const savedOnly = c.req.query('saved') === 'true';
    
    let query = 'SELECT * FROM c WHERE c.userID = @userID';
    const parameters: any[] = [{ name: '@userID', value: userID }];
    
    if (savedOnly) {
      query += ' AND c.isSaved = true';
    }
    
    query += ' ORDER BY c.createdAt DESC';

    const { resources: recipes } = await container.items
      .query<Recipe>({
        query,
        parameters,
      })
      .fetchAll();

    return c.json({ recipes });
  } catch (error) {
    console.error('Error fetching recipes:', error);
    return c.json({ error: 'Failed to fetch recipes' }, 500);
  }
});

/**
 * Get a specific recipe
 * GET /recipes/:recipeID
 */
app.get('/:recipeID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Recipe service not available' }, 503);
  }

  try {
    const recipeID = c.req.param('recipeID');
    const userID = c.req.query('userID');

    if (!userID) {
      return c.json({ error: 'userID query parameter is required' }, 400);
    }

    const container = getContainer('recipes');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resource: recipe } = await container
      .item(recipeID, userID)
      .read<Recipe>();

    if (!recipe) {
      return c.json({ error: 'Recipe not found' }, 404);
    }

    return c.json({ recipe });
  } catch (error) {
    console.error('Error fetching recipe:', error);
    return c.json({ error: 'Failed to fetch recipe' }, 500);
  }
});

/**
 * Save/unsave a recipe or update user portion size
 * PATCH /recipes/:recipeID
 */
app.patch('/:recipeID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Recipe service not available' }, 503);
  }

  try {
    const recipeID = c.req.param('recipeID');
    const { userID, isSaved, userPortionSize } = await c.req.json();

    if (!userID) {
      return c.json({ error: 'userID is required' }, 400);
    }

    const container = getContainer('recipes');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resource: recipe } = await container
      .item(recipeID, userID)
      .read<Recipe>();

    if (!recipe) {
      return c.json({ error: 'Recipe not found' }, 404);
    }

    if (typeof isSaved === 'boolean') {
      recipe.isSaved = isSaved;
    }

    if (typeof userPortionSize === 'number' && userPortionSize > 0) {
      recipe.userPortionSize = userPortionSize;
    } else if (userPortionSize === null || userPortionSize === undefined) {
      // Allow clearing userPortionSize by sending null
      delete recipe.userPortionSize;
    }

    recipe.updatedAt = new Date().toISOString();

    await container.item(recipeID, userID).replace(recipe);

    return c.json({ recipe });
  } catch (error) {
    console.error('Error updating recipe:', error);
    return c.json({ error: 'Failed to update recipe' }, 500);
  }
});

/**
 * Delete a recipe
 * DELETE /recipes/:recipeID
 */
app.delete('/:recipeID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Recipe service not available' }, 503);
  }

  try {
    const recipeID = c.req.param('recipeID');
    const userID = c.req.query('userID');

    if (!userID) {
      return c.json({ error: 'userID query parameter is required' }, 400);
    }

    const container = getContainer('recipes');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Verify recipe exists and belongs to user
    const { resource: recipe } = await container
      .item(recipeID, userID)
      .read<Recipe>();

    if (!recipe) {
      return c.json({ error: 'Recipe not found' }, 404);
    }

    // Verify ownership
    if (recipe.userID !== userID) {
      return c.json({ error: 'Unauthorized: Recipe does not belong to user' }, 403);
    }

    // Delete the recipe
    await container.item(recipeID, userID).delete();

    console.log(`✅ Recipe deleted: ${recipeID}`);

    return c.json({ message: 'Recipe deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting recipe:', error);
    return c.json({ error: 'Failed to delete recipe' }, 500);
  }
});

export default app;

