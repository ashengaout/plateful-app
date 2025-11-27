import { Hono } from 'hono';
import { getContainer, generateId, isCosmosAvailable } from '../lib/cosmos';
import { extractIntent } from '../services/intent-extraction';
import { searchRecipe } from '../services/recipe-search';
import { scrapeRecipeContent } from '../services/recipe-scraper';
import { formatRecipe } from '../services/recipe-formatter';
import { substituteIngredients, detectDisallowedIngredients } from '../services/ingredient-substitution';
import { requiresUnavailableEquipment } from '../services/equipment-filter';
import type { ChatMessage, ChatConversation, Recipe, RecipeGenerateRequest, FoodProfile } from '@plateful/shared';

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
    const body = await c.req.json<RecipeGenerateRequest>();
    const { conversationID, userID } = body;

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

    // Step 2: Extract intent
    console.log(`🧠 Extracting intent from conversation...`);
    const intent = await extractIntent(messages, profile);
    console.log(`✅ Intent extracted: ${intent.dish} (status: ${intent.status})`);

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
    console.log(`🔍 Searching for recipes: ${intent.searchQuery}`);
    const searchResults = await searchRecipe(intent.searchQuery, profile);
    console.log(`✅ Found ${searchResults.length} recipe options`);

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
        recipeData = await formatRecipe(scrapeResult.content, searchResult.url, profile);
        
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

        // Step 5.5: Check for disallowed ingredients and substitute if needed
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
                console.log(`ℹ️ No substitutions were made (may have been filtered out during search)`);
              }
            } catch (subError) {
              console.warn(`❌ Failed to substitute ingredients: ${subError instanceof Error ? subError.message : 'Unknown error'}`);
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
        // Continue to next URL
      }
    }
    
    // If all URLs failed, throw error (don't create fallback)
    if (!recipeData || !successfulUrl) {
      const errorMessage = `Failed to scrape any of the ${searchResults.length} recipe URLs. Last error: ${lastError?.message || 'Unknown error'}`;
      console.error(`❌ ${errorMessage}`);
      return c.json({ 
        error: 'Failed to retrieve recipe',
        message: 'Unable to access any recipe websites. Please try again later or with a different dish.',
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

