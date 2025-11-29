import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { getContainer, generateId, isCosmosAvailable } from '../lib/cosmos';
import type { ChatMessage, ChatConversation, ChatMessageCreateRequest, ConversationCreateRequest, FoodProfile, Recipe, RecipeData } from '@plateful/shared';

const app = new Hono();

// Add query parameter support for legacy mobile app compatibility
app.all('*', async (c, next) => {
  const action = c.req.query('action');
  
  // If no action query param, continue to REST routes
  if (!action) {
    return next();
  }

  // Handle legacy query parameter format
  const conversationID = c.req.query('conversationID');
  
  try {
    // GET /api/chat?action=messages&conversationID=xxx
    if (c.req.method === 'GET' && action === 'messages' && conversationID) {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }
      
      const container = getContainer('chatMessages');
      if (!container) {
        return c.json({ error: 'Database not available' }, 503);
      }

      const { resources: messages } = await container.items
        .query<ChatMessage>({
          query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex ASC',
          parameters: [{ name: '@conversationID', value: conversationID }],
        })
        .fetchAll();

      return c.json({ messages });
    }

    // GET /api/chat?action=conversation&conversationID=xxx
    if (c.req.method === 'GET' && action === 'conversation' && conversationID) {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }
      
      const container = getContainer('chatConversations');
      if (!container) {
        return c.json({ error: 'Database not available' }, 503);
      }

      const { resource: conversation } = await container
        .item(conversationID, conversationID)
        .read<ChatConversation>();

      if (!conversation) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      return c.json({ conversation });
    }

    // POST /api/chat?action=conversation
    if (c.req.method === 'POST' && action === 'conversation') {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }

      const body = await c.req.json<ConversationCreateRequest>();
      const { userID } = body;

      if (!userID) {
        return c.json({ error: 'userID is required' }, 400);
      }

      const newConversationID = generateId('conv');
      const now = new Date().toISOString();

      const conversation: ChatConversation = {
        id: newConversationID,
        conversationID: newConversationID,
        userID,
        status: 'exploring',
        createdAt: now,
        updatedAt: now,
      };

      const container = getContainer('chatConversations');
      if (!container) {
        return c.json({ error: 'Database not available' }, 503);
      }

      await container.items.create(conversation);
      return c.json({ conversation }, 201);
    }

    // POST /api/chat?action=message
    if (c.req.method === 'POST' && action === 'message') {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }

      const body = await c.req.json<ChatMessageCreateRequest>();
      const { conversationID: msgConversationID, role, content } = body;

      if (!msgConversationID || !role || !content) {
        return c.json({ error: 'conversationID, role, and content are required' }, 400);
      }

      const messageContainer = getContainer('chatMessages');
      const conversationContainer = getContainer('chatConversations');
      
      if (!messageContainer || !conversationContainer) {
        return c.json({ error: 'Database not available' }, 503);
      }

      const { resources: existingMessages } = await messageContainer.items
        .query<ChatMessage>({
          query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex DESC OFFSET 0 LIMIT 1',
          parameters: [{ name: '@conversationID', value: msgConversationID }],
        })
        .fetchAll();

      const messageIndex = existingMessages.length > 0 ? existingMessages[0].messageIndex + 1 : 0;
      const messageId = generateId('msg');

      const message: ChatMessage = {
        id: messageId,
        conversationID: msgConversationID,
        messageIndex,
        role,
        content,
        timestamp: new Date().toISOString(),
      };

      await messageContainer.items.create(message);

      const { resource: conversation } = await conversationContainer
        .item(msgConversationID, msgConversationID)
        .read<ChatConversation>();

      if (conversation) {
        conversation.updatedAt = new Date().toISOString();
        await conversationContainer.item(msgConversationID, msgConversationID).replace(conversation);
      }

      return c.json({ message }, 201);
    }

    // POST /api/chat?action=ai-response
    if (c.req.method === 'POST' && action === 'ai-response') {
      // Handle ai-response - the route handler will process it
      // We need to rewrite the path so it matches /ai-response
      // For now, we'll handle it directly here by calling next() and hoping
      // the route matches, but actually we need to handle it fully
      // Since the path is /api/chat, it won't match /ai-response
      // So we need to handle it here
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }

      const body = await c.req.json();
      const { conversationID, userID, includePantry } = body;

      console.log(`📥 AI response request (legacy) - conversationID: ${conversationID}, userID: ${userID}, includePantry: ${includePantry}`);

      if (!conversationID) {
        return c.json({ error: 'conversationID is required' }, 400);
      }

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

      let profile: FoodProfile | null = null;
      if (userID) {
        const profileContainer = getContainer('userProfiles');
        if (profileContainer) {
          try {
            const { resource } = await profileContainer.item(userID, userID).read<FoodProfile>();
            profile = resource || null;
          } catch (error) {
            // Profile not found, continue without it
          }
        }
      }

      const client = new Anthropic({ 
        apiKey: process.env.ANTHROPIC_API_KEY 
      });

      const conversationHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));

      const { resource: conversation } = await getContainer('chatConversations')
        ?.item(conversationID, conversationID)
        .read<ChatConversation>() || { resource: null };

      let recipeContext = '';
      if (conversation?.status === 'editing_recipe' && conversation.editingRecipeID && userID) {
        const recipesContainer = getContainer('recipes');
        if (recipesContainer) {
          try {
            const { resource: recipe } = await recipesContainer
              .item(conversation.editingRecipeID, userID)
              .read();
            if (recipe) {
              recipeContext = `\n\n📝 RECIPE EDITING MODE:\nYou are helping the user edit this recipe:\n` +
                `Title: ${recipe.recipeData.title}\n` +
                `Description: ${recipe.recipeData.description || 'N/A'}\n` +
                `Portions: ${recipe.recipeData.portions}\n` +
                `Ingredients: ${recipe.recipeData.ingredients.join(', ')}\n` +
                `Instructions: ${recipe.recipeData.instructions.join('; ')}\n\n` +
                `When the user requests changes, acknowledge them and describe the modified recipe. ` +
                `After the user confirms the edits, they will save it as a new recipe. ` +
                `DO NOT generate a new recipe from scratch - modify the existing one based on their requests.`;
            }
          } catch (error) {
            // Could not load recipe context
          }
        }
      }

      // Fetch pantry items if includePantry is true
      let pantryContext = '';
      if (includePantry && userID) {
        console.log(`📦 Fetching pantry items for user ${userID} (includePantry: ${includePantry})`);
        const pantryContainer = getContainer('pantries');
        if (pantryContainer) {
          try {
            const { resources: pantryItems } = await pantryContainer.items
              .query({
                query: 'SELECT * FROM c WHERE c.userID = @userID',
                parameters: [{ name: '@userID', value: userID }],
              })
              .fetchAll();
            
            console.log(`📦 Found ${pantryItems?.length || 0} pantry items`);
            
            if (pantryItems && pantryItems.length > 0) {
              const ingredientNames = pantryItems.map((item: any) => item.name).join(', ');
              console.log(`📦 Pantry ingredients: ${ingredientNames}`);
              pantryContext = `\n\n📦 USER'S PANTRY INGREDIENTS (YOU ALREADY KNOW THESE - DO NOT ASK):\nThe user has these ingredients available: ${ingredientNames}\n\n🚨🚨🚨 CRITICAL INSTRUCTIONS - READ CAREFULLY 🚨🚨🚨\n\nThe user just asked for recipes "inspired by my pantry" or "based on my pantry". You MUST:\n\n1. DO NOT ask "what ingredients do you have?" - you already know them: ${ingredientNames}\n2. DO NOT ask them to list their ingredients - you already have the complete list above\n3. DO NOT generate full recipes with ingredients and instructions - ONLY suggest dish names\n4. IMMEDIATELY suggest 2-3 REAL DISH NAMES based on ingredient combinations:\n   - Look for recognizable ingredient combinations that suggest real dishes\n   - Example: gochujang + kimchi → suggest "kimchi jjigae" (Korean kimchi stew)\n   - Example: tamarind + fish sauce + shrimp → suggest "tom yum soup" or "pad thai"\n   - Example: coconut oil + shrimp + rice noodles → suggest "pad thai" or "laksa"\n5. Suggest REAL, SEARCHABLE dish names - not made-up combinations\n6. Keep suggestions brief - just dish names with a short description\n7. The user will click "Find Recipe" to generate the actual recipe - you don't generate it here\n8. Start suggesting dishes RIGHT NOW - don't ask for more information\n\nEXAMPLE GOOD RESPONSE:\n"Based on what you have (${ingredientNames.split(', ').slice(0, 5).join(', ')}, etc.), here are some great options:\n\n1. **Kimchi Jjigae** - Korean kimchi stew that uses your gochujang and kimchi. You might want to add pork or tofu.\n\n2. **Pad Thai** - Thai stir-fried noodles that work great with your shrimp, rice noodles, and tamarind. You might need some additional vegetables.\n\n3. **Tom Yum Soup** - Spicy Thai soup perfect for your shrimp and tamarind. You might want to add some mushrooms and lime."\n\nDO NOT:\n- Generate full recipes with ingredients lists and instructions\n- Ask "What ingredients do you have?"\n- Create made-up dish names - use real, recognizable dish names\n- Write long recipe descriptions - keep it brief`;
            } else {
              console.log('📦 No pantry items found for user');
            }
          } catch (error) {
            console.error('❌ Could not load pantry items:', error);
          }
        } else {
          console.log('📦 Pantry container not available');
        }
      } else {
        console.log(`📦 Not fetching pantry (includePantry: ${includePantry}, userID: ${userID})`);
      }

      let systemPrompt = "You are a helpful recipe assistant for the Plateful app. Help users discover delicious recipes through friendly conversation. Ask follow-up questions to understand their preferences, suggest dishes, and guide them toward finding the perfect recipe. Keep responses conversational, helpful, and food-focused." + recipeContext + pantryContext;
      
      if (profile) {
        const restrictions: string[] = [];
        const allergens: string[] = [];
        
        if (profile.restrictions && profile.restrictions.length > 0) {
          restrictions.push(...profile.restrictions);
        }
        if (profile.allergens && profile.allergens.length > 0) {
          allergens.push(...profile.allergens);
        }

        if (restrictions.length > 0 || allergens.length > 0) {
          systemPrompt += `\n\n⚠️⚠️⚠️ CRITICAL DIETARY RESTRICTIONS - ABSOLUTE ENFORCEMENT REQUIRED ⚠️⚠️⚠️\n`;
          systemPrompt += `THESE RESTRICTIONS ARE NON-NEGOTIABLE AND MUST BE STRICTLY ENFORCED IN EVERY RESPONSE.\n\n`;
          
          if (restrictions.length > 0) {
            systemPrompt += `🚫 ABSOLUTELY FORBIDDEN FOODS/RESTRICTIONS: ${restrictions.join(', ').toUpperCase()}\n\n`;
          }
          
          if (allergens.length > 0) {
            systemPrompt += `\n\n🚨🚨🚨 CRITICAL ALLERGENS - LIFE-THREATENING SAFETY ISSUE 🚨🚨🚨\n`;
            systemPrompt += `⚠️ ALLERGENS TO AVOID: ${allergens.join(', ').toUpperCase()}\n\n`;
          }
        }

        if (profile.unavailableEquipment && profile.unavailableEquipment.length > 0) {
          systemPrompt += `\n\n🚫🚫🚫 UNAVAILABLE EQUIPMENT - ABSOLUTE ENFORCEMENT REQUIRED 🚫🚫🚫\n`;
          systemPrompt += `THE USER DOES NOT HAVE ACCESS TO: ${profile.unavailableEquipment.join(', ').toUpperCase()}\n`;
          systemPrompt += `DO NOT suggest, recommend, or discuss recipes that require these items.\n`;
          systemPrompt += `If the user asks about a dish that requires unavailable equipment, politely redirect them to an alternative method or dish.\n`;
          systemPrompt += `This is a hard constraint - never suggest recipes requiring unavailable equipment.\n\n`;
        }

        if (profile.likes && profile.likes.length > 0) {
          systemPrompt += `\n✅ User prefers: ${profile.likes.join(', ')}. You can emphasize these preferences when relevant.\n`;
        }
        if (profile.dislikes && profile.dislikes.length > 0) {
          systemPrompt += `\n❌ User dislikes: ${profile.dislikes.join(', ')}. Avoid emphasizing these.\n`;
        }
      }

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt,
        messages: conversationHistory
      });

      let aiResponse = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          aiResponse += block.text;
        }
      }

      return c.json({ response: aiResponse });
    }

    // POST /api/chat?action=load-recipe
    if (c.req.method === 'POST' && action === 'load-recipe') {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }

      const body = await c.req.json();
      const { conversationID, recipeID, userID } = body;

      if (!conversationID || !recipeID || !userID) {
        return c.json({ error: 'conversationID, recipeID, and userID are required' }, 400);
      }

      const conversationContainer = getContainer('chatConversations');
      const recipesContainer = getContainer('recipes');
      
      if (!conversationContainer || !recipesContainer) {
        return c.json({ error: 'Database not available' }, 503);
      }

      const { resource: recipe } = await recipesContainer
        .item(recipeID, userID)
        .read();
      
      if (!recipe) {
        return c.json({ error: 'Recipe not found' }, 404);
      }

      if (recipe.userID !== userID) {
        return c.json({ error: 'Unauthorized: Recipe does not belong to user' }, 403);
      }

      const { resource: conversation } = await conversationContainer
        .item(conversationID, conversationID)
        .read<ChatConversation>();

      if (!conversation) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      conversation.status = 'editing_recipe';
      conversation.editingRecipeID = recipeID;
      conversation.updatedAt = new Date().toISOString();
      await conversationContainer.item(conversationID, conversationID).replace(conversation);

      const messageContainer = getContainer('chatMessages');
      if (messageContainer) {
        const { resources: existingMessages } = await messageContainer.items
          .query({
            query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex DESC OFFSET 0 LIMIT 1',
            parameters: [{ name: '@conversationID', value: conversationID }],
          })
          .fetchAll();

        const messageIndex = existingMessages.length > 0 ? existingMessages[0].messageIndex + 1 : 0;
        const messageId = generateId('msg');

        const message = {
          id: messageId,
          conversationID,
          messageIndex,
          role: 'assistant',
          content: `I've loaded your recipe "${recipe.recipeData.title}". How would you like to modify it? For example, you can ask me to make it vegetarian, adjust the servings, change ingredients, or modify the instructions.`,
          timestamp: new Date().toISOString(),
        };

        await messageContainer.items.create(message);
      }

      return c.json({ 
        success: true, 
        conversation,
        recipe: {
          id: recipe.recipeID,
          title: recipe.recipeData.title,
        }
      }, 200);
    }

    // POST /api/chat?action=save-edited-recipe
    if (c.req.method === 'POST' && action === 'save-edited-recipe') {
      if (!isCosmosAvailable()) {
        return c.json({ error: 'Chat service not available' }, 503);
      }

      const body = await c.req.json();
      const { conversationID, userID } = body;

      if (!conversationID || !userID) {
        return c.json({ error: 'conversationID and userID are required' }, 400);
      }

      const conversationContainer = getContainer('chatConversations');
      const recipesContainer = getContainer('recipes');
      const messagesContainer = getContainer('chatMessages');
      
      if (!conversationContainer || !recipesContainer || !messagesContainer) {
        return c.json({ error: 'Database not available' }, 503);
      }

      const { resource: conversation } = await conversationContainer
        .item(conversationID, conversationID)
        .read<ChatConversation>();

      if (!conversation || conversation.status !== 'editing_recipe' || !conversation.editingRecipeID) {
        return c.json({ error: 'No recipe being edited in this conversation' }, 400);
      }

      const { resource: originalRecipe } = await recipesContainer
        .item(conversation.editingRecipeID, userID)
        .read();

      if (!originalRecipe) {
        return c.json({ error: 'Original recipe not found' }, 404);
      }

      const { resources: messages } = await messagesContainer.items
        .query({
          query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex ASC',
          parameters: [{ name: '@conversationID', value: conversationID }],
        })
        .fetchAll();

      if (messages.length === 0) {
        return c.json({ error: 'No messages in conversation' }, 400);
      }

      let profile: FoodProfile | null = null;
      const profileContainer = getContainer('userProfiles');
      if (profileContainer) {
        try {
          const { resource } = await profileContainer.item(userID, userID).read<FoodProfile>();
          profile = resource || null;
        } catch (error) {
          // Profile not found, continue without it
        }
      }

      const conversationText = messages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');

      const { formatRecipe } = await import('../services/recipe-formatter');
      
      const scrapedContent = `Modified Recipe Conversation:\n\n${conversationText}\n\n` +
        `Original Recipe:\n` +
        `Title: ${originalRecipe.recipeData.title}\n` +
        `Description: ${originalRecipe.recipeData.description}\n` +
        `Portions: ${originalRecipe.recipeData.portions}\n` +
        `Ingredients: ${originalRecipe.recipeData.ingredients.join(', ')}\n` +
        `Instructions: ${originalRecipe.recipeData.instructions.join('; ')}`;

      let modifiedRecipeData: RecipeData;
      try {
        modifiedRecipeData = await formatRecipe(scrapedContent, originalRecipe.recipeData.sourceUrl, profile);
      } catch (formatError) {
        const errorMessage = formatError instanceof Error ? formatError.message : 'Unknown formatting error';
        return c.json({ 
          error: `Failed to format edited recipe: ${errorMessage}. The AI may have had trouble extracting the recipe changes from the conversation.` 
        }, 500);
      }

      if (!modifiedRecipeData.imageUrl && originalRecipe.recipeData.imageUrl) {
        modifiedRecipeData.imageUrl = originalRecipe.recipeData.imageUrl;
      }

      const recipeID = generateId('recipe');
      const now = new Date().toISOString();

      const newRecipe: Recipe = {
        id: recipeID,
        userID,
        recipeID,
        recipeNameLower: modifiedRecipeData.title.toLowerCase(),
        sourceUrlLower: originalRecipe.sourceUrlLower,
        recipeData: modifiedRecipeData,
        isSaved: false,
        isEdited: true,
        originalRecipeID: originalRecipe.recipeID,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await recipesContainer.items.create(newRecipe);
      } catch (createError) {
        return c.json({ 
          error: `Failed to save recipe to database: ${createError instanceof Error ? createError.message : 'Unknown error'}` 
        }, 500);
      }

      try {
        conversation.status = 'recipe_found';
        conversation.recipeID = recipeID;
        conversation.updatedAt = new Date().toISOString();
        await conversationContainer.item(conversationID, conversationID).replace(conversation);
      } catch (updateError) {
        // Don't fail if conversation update fails - recipe was already saved
      }

      return c.json({ 
        recipe: newRecipe,
        message: 'Recipe saved successfully!'
      }, 201);
    }

    // Unknown action, continue to REST routes
    return next();
  } catch (error) {
    console.error('Error handling query parameter action:', error);
    return c.json({ error: 'Failed to process request' }, 500);
  }
});

/**
 * Create a new conversation
 * POST /chat/conversation
 */
app.post('/conversation', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const body = await c.req.json<ConversationCreateRequest>();
    const { userID } = body;

    if (!userID) {
      return c.json({ error: 'userID is required' }, 400);
    }

    const conversationID = generateId('conv');
    const now = new Date().toISOString();

    const conversation: ChatConversation = {
      id: conversationID,
      conversationID,
      userID,
      status: 'exploring',
      createdAt: now,
      updatedAt: now,
    };

    const container = getContainer('chatConversations');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    await container.items.create(conversation);

    return c.json({ conversation }, 201);
  } catch (error) {
    console.error('Error creating conversation:', error);
    return c.json({ error: 'Failed to create conversation' }, 500);
  }
});

/**
 * Get conversation by ID
 * GET /chat/conversation/:id
 */
app.get('/conversation/:id', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const conversationID = c.req.param('id');
    const container = getContainer('chatConversations');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resource: conversation } = await container
      .item(conversationID, conversationID)
      .read<ChatConversation>();

    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    return c.json({ conversation });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return c.json({ error: 'Failed to fetch conversation' }, 500);
  }
});

/**
 * Update conversation status
 * PATCH /chat/conversation/:id
 */
app.patch('/conversation/:id', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const conversationID = c.req.param('id');
    const updates = await c.req.json();
    const container = getContainer('chatConversations');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resource: existing } = await container
      .item(conversationID, conversationID)
      .read<ChatConversation>();

    if (!existing) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const updated: ChatConversation = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await container.item(conversationID, conversationID).replace(updated);

    return c.json({ conversation: updated });
  } catch (error) {
    console.error('Error updating conversation:', error);
    return c.json({ error: 'Failed to update conversation' }, 500);
  }
});

/**
 * Send a chat message
 * POST /chat/message
 */
app.post('/message', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const body = await c.req.json<ChatMessageCreateRequest>();
    const { conversationID, role, content } = body;

    if (!conversationID || !role || !content) {
      return c.json({ error: 'conversationID, role, and content are required' }, 400);
    }

    const messageContainer = getContainer('chatMessages');
    const conversationContainer = getContainer('chatConversations');
    
    if (!messageContainer || !conversationContainer) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Get current message count for this conversation
    const { resources: existingMessages } = await messageContainer.items
      .query<ChatMessage>({
        query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex DESC OFFSET 0 LIMIT 1',
        parameters: [{ name: '@conversationID', value: conversationID }],
      })
      .fetchAll();

    const messageIndex = existingMessages.length > 0 ? existingMessages[0].messageIndex + 1 : 0;
    const messageId = generateId('msg');

    const message: ChatMessage = {
      id: messageId,
      conversationID,
      messageIndex,
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    await messageContainer.items.create(message);

    // Update conversation's updatedAt timestamp
    const { resource: conversation } = await conversationContainer
      .item(conversationID, conversationID)
      .read<ChatConversation>();

    if (conversation) {
      conversation.updatedAt = new Date().toISOString();
      await conversationContainer.item(conversationID, conversationID).replace(conversation);
    }

    return c.json({ message }, 201);
  } catch (error) {
    console.error('Error creating message:', error);
    return c.json({ error: 'Failed to create message' }, 500);
  }
});

/**
 * Get all messages for a conversation
 * GET /chat/messages/:conversationID
 */
app.get('/messages/:conversationID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const conversationID = c.req.param('conversationID');
    const container = getContainer('chatMessages');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resources: messages } = await container.items
      .query<ChatMessage>({
        query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex ASC',
        parameters: [{ name: '@conversationID', value: conversationID }],
      })
      .fetchAll();

    return c.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }
});

/**
 * Get all conversations for a user
 * GET /chat/conversations/user/:userID
 */
app.get('/conversations/user/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const container = getContainer('chatConversations');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resources: conversations } = await container.items
      .query<ChatConversation>({
        query: 'SELECT * FROM c WHERE c.userID = @userID ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@userID', value: userID }],
      })
      .fetchAll();

    return c.json({ conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return c.json({ error: 'Failed to fetch conversations' }, 500);
  }
});

/**
 * Generate AI response for a conversation
 * POST /chat/ai-response
 */
app.post('/ai-response', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const body = await c.req.json();
    const { conversationID, userID, includePantry } = body;

    console.log(`📥 AI response request - conversationID: ${conversationID}, userID: ${userID}, includePantry: ${includePantry}`);

    if (!conversationID) {
      return c.json({ error: 'conversationID is required' }, 400);
    }

    // Get conversation messages
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

    // Fetch user profile if userID is provided
    let profile: FoodProfile | null = null;
    if (userID) {
      const profileContainer = getContainer('userProfiles');
      if (profileContainer) {
        try {
          const { resource } = await profileContainer.item(userID, userID).read<FoodProfile>();
          profile = resource || null;
          if (profile) {
            console.log(`✅ User profile loaded: ${profile.restrictions.length} restrictions, ${profile.allergens.length} allergens`);
          }
        } catch (error) {
          console.log(`ℹ️ No profile found for user ${userID}`);
        }
      }
    }

    // Initialize Anthropic client
    const client = new Anthropic({ 
      apiKey: process.env.ANTHROPIC_API_KEY 
    });

    // Build conversation history for Claude
    const conversationHistory = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content
    }));

    // Check if conversation is in recipe editing mode
    const { resource: conversation } = await getContainer('chatConversations')
      ?.item(conversationID, conversationID)
      .read<ChatConversation>() || { resource: null };

    let recipeContext = '';
    if (conversation?.status === 'editing_recipe' && conversation.editingRecipeID && userID) {
      const recipesContainer = getContainer('recipes');
      if (recipesContainer) {
        try {
          const { resource: recipe } = await recipesContainer
            .item(conversation.editingRecipeID, userID)
            .read();
          if (recipe) {
            recipeContext = `\n\n📝 RECIPE EDITING MODE:\nYou are helping the user edit this recipe:\n` +
              `Title: ${recipe.recipeData.title}\n` +
              `Description: ${recipe.recipeData.description || 'N/A'}\n` +
              `Portions: ${recipe.recipeData.portions}\n` +
              `Ingredients: ${recipe.recipeData.ingredients.join(', ')}\n` +
              `Instructions: ${recipe.recipeData.instructions.join('; ')}\n\n` +
              `When the user requests changes, acknowledge them and describe the modified recipe. ` +
              `After the user confirms the edits, they will save it as a new recipe. ` +
              `DO NOT generate a new recipe from scratch - modify the existing one based on their requests.`;
          }
        } catch (error) {
          console.log('Could not load recipe context for editing');
        }
      }
    }

    // Fetch pantry items if includePantry is true
    let pantryContext = '';
    if (includePantry && userID) {
      console.log(`📦 Fetching pantry items for user ${userID} (includePantry: ${includePantry})`);
      const pantryContainer = getContainer('pantries');
      if (pantryContainer) {
        try {
          const { resources: pantryItems } = await pantryContainer.items
            .query({
              query: 'SELECT * FROM c WHERE c.userID = @userID',
              parameters: [{ name: '@userID', value: userID }],
            })
            .fetchAll();
          
          console.log(`📦 Found ${pantryItems?.length || 0} pantry items`);
          
          if (pantryItems && pantryItems.length > 0) {
            const ingredientNames = pantryItems.map((item: any) => item.name).join(', ');
            console.log(`📦 Pantry ingredients: ${ingredientNames}`);
            pantryContext = `\n\n📦 USER'S PANTRY INGREDIENTS (YOU ALREADY KNOW THESE - DO NOT ASK):\nThe user has these ingredients available: ${ingredientNames}\n\n🚨🚨🚨 CRITICAL INSTRUCTIONS - READ CAREFULLY 🚨🚨🚨\n\nThe user just asked for recipes "inspired by my pantry" or "based on my pantry". You MUST:\n\n1. DO NOT ask "what ingredients do you have?" - you already know them: ${ingredientNames}\n2. DO NOT ask them to list their ingredients - you already have the complete list above\n3. IMMEDIATELY suggest 2-3 specific recipes using the ingredients listed above\n4. You can say: "Based on what you have (${ingredientNames}), [recipe name] with [additional ingredient] might be good. Let me know if you'd like to add any other ingredients"\n5. Start suggesting recipes RIGHT NOW - don't ask for more information\n6. It's okay to mention other ingredients they might need, but prioritize recipes using their existing items\n7. The user expects you to know their pantry - NEVER ask them to tell you what they have\n\nEXAMPLE GOOD RESPONSE:\n"Based on what you have (${ingredientNames.split(', ').slice(0, 5).join(', ')}, etc.), here are some great options:\n\n1. [Recipe name] - uses [your ingredients]. You might want to add [xyz] or [abc]. Let me know if you'd like to add any other ingredients.\n\n2. [Another recipe] - uses [your ingredients]..."\n\nDO NOT start with "What ingredients do you have?" or "Could you tell me what's in your pantry?" - you already know!`;
          } else {
            console.log('📦 No pantry items found for user');
          }
        } catch (error) {
          console.error('❌ Could not load pantry items:', error);
        }
      } else {
        console.log('📦 Pantry container not available');
      }
    } else {
      console.log(`📦 Not fetching pantry (includePantry: ${includePantry}, userID: ${userID})`);
    }

    // Build system prompt with strict dietary restrictions
    let systemPrompt = "You are a helpful recipe assistant for the Plateful app. Help users discover delicious recipes through friendly conversation. Ask follow-up questions to understand their preferences, suggest dishes, and guide them toward finding the perfect recipe. Keep responses conversational, helpful, and food-focused." + recipeContext + pantryContext;
    
    if (profile) {
      // CRITICAL: Build strict restriction enforcement
      const restrictions: string[] = [];
      const allergens: string[] = [];
      
      if (profile.restrictions && profile.restrictions.length > 0) {
        restrictions.push(...profile.restrictions);
      }
      if (profile.allergens && profile.allergens.length > 0) {
        allergens.push(...profile.allergens);
      }

      // Debug logging
      console.log(`📋 Profile restrictions: [${restrictions.join(', ')}]`);
      console.log(`🚨 Profile allergens: [${allergens.join(', ')}]`);

      if (restrictions.length > 0 || allergens.length > 0) {
        systemPrompt += `\n\n⚠️⚠️⚠️ CRITICAL DIETARY RESTRICTIONS - ABSOLUTE ENFORCEMENT REQUIRED ⚠️⚠️⚠️\n`;
        systemPrompt += `THESE RESTRICTIONS ARE NON-NEGOTIABLE AND MUST BE STRICTLY ENFORCED IN EVERY RESPONSE.\n`;
        systemPrompt += `VIOLATING THESE RESTRICTIONS IS UNACCEPTABLE AND DANGEROUS.\n\n`;
        
        if (restrictions.length > 0) {
          const restrictionsList = restrictions.map(r => r.toLowerCase());
          systemPrompt += `🚫 ABSOLUTELY FORBIDDEN FOODS/RESTRICTIONS: ${restrictions.join(', ').toUpperCase()}\n\n`;
          
          // Specific enforcement rules for common restrictions
          if (restrictionsList.includes('pescatarian')) {
            systemPrompt += `⚠️ PESCATARIAN RESTRICTION DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: ALL meat (beef, pork, lamb, veal, etc.) and ALL poultry (chicken, turkey, duck, etc.)\n`;
            systemPrompt += `- ALLOWED: ONLY finned fish and plant-based ingredients\n`;
            
            // Check if shellfish allergy exists - if so, exclude shellfish from pescatarian options
            const hasShellfishAllergy = allergens.length > 0 && allergens.map(a => a.toLowerCase()).includes('shellfish');
            if (hasShellfishAllergy) {
              systemPrompt += `- IMPORTANT: Due to shellfish allergy, ONLY suggest finned fish (salmon, tuna, cod, etc.) - NEVER suggest shellfish\n`;
              systemPrompt += `- When suggesting proteins, ONLY mention: salmon, tuna, cod, halibut, etc. (finned fish only)\n`;
            } else {
              systemPrompt += `- When suggesting proteins, you may mention: fish, seafood, salmon, tuna, etc. (but verify no allergens are present)\n`;
            }
            systemPrompt += `- NEVER chicken, beef, pork, turkey, or any land animals\n`;
            systemPrompt += `- If listing protein options, ONLY list finned fish (if no shellfish allergy) or plant-based options\n\n`;
          }
          
          if (restrictionsList.includes('vegetarian')) {
            systemPrompt += `⚠️ VEGETARIAN RESTRICTION DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: ALL meat, poultry, fish, and seafood\n`;
            systemPrompt += `- ALLOWED: ONLY plant-based ingredients, eggs, and dairy\n`;
            systemPrompt += `- NEVER suggest any animal flesh\n\n`;
          }
          
          if (restrictionsList.includes('vegan')) {
            systemPrompt += `⚠️ VEGAN RESTRICTION DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: ALL animal products (meat, poultry, fish, seafood, eggs, dairy, honey)\n`;
            systemPrompt += `- ALLOWED: ONLY plant-based ingredients\n`;
            systemPrompt += `- NEVER suggest any animal-derived products\n\n`;
          }
          
          // Specific food restrictions
          if (restrictionsList.includes('pork')) {
            systemPrompt += `⚠️ PORK RESTRICTION: NEVER suggest pork, bacon, ham, prosciutto, sausage (if pork-based), or any pork products\n`;
          }
          if (restrictionsList.includes('beef')) {
            systemPrompt += `⚠️ BEEF RESTRICTION: NEVER suggest beef, steak, hamburgers, ground beef, or any beef products\n`;
          }
          if (restrictionsList.includes('poultry')) {
            systemPrompt += `⚠️ POULTRY RESTRICTION: NEVER suggest chicken, turkey, duck, or any poultry\n`;
          }
          
          systemPrompt += `\n🔒 MANDATORY ENFORCEMENT RULES:\n`;
          systemPrompt += `1. BEFORE suggesting ANY protein or dish, verify it complies with ALL restrictions above\n`;
          systemPrompt += `2. When listing options, ONLY list compliant options - DO NOT list forbidden items\n`;
          systemPrompt += `3. If user asks about a restricted food, respond: "I can't suggest [food] due to your dietary restrictions. How about [compliant alternative] instead?"\n`;
          systemPrompt += `4. NEVER suggest or even mention restricted foods as options\n`;
          systemPrompt += `5. This is a SAFETY and RESPECT issue - violations are UNACCEPTABLE\n\n`;
        }
        
        if (allergens.length > 0) {
          const allergensList = allergens.map(a => a.toLowerCase());
          systemPrompt += `\n\n🚨🚨🚨 CRITICAL ALLERGENS - LIFE-THREATENING SAFETY ISSUE 🚨🚨🚨\n`;
          systemPrompt += `THESE ALLERGENS CAN CAUSE SERIOUS HARM OR DEATH. ABSOLUTELY NO EXCEPTIONS.\n\n`;
          systemPrompt += `⚠️ ALLERGENS TO AVOID: ${allergens.join(', ').toUpperCase()}\n\n`;
          
          // Specific enforcement for common allergens
          if (allergensList.includes('shellfish')) {
            systemPrompt += `🚨 SHELLFISH ALLERGY DETECTED - EXTREME CAUTION REQUIRED:\n`;
            systemPrompt += `- ABSOLUTELY FORBIDDEN: ALL shellfish including shrimp, crab, lobster, crawfish, crayfish, prawns, scallops, mussels, clams, oysters, squid, octopus, calamari, and ANY seafood with a shell\n`;
            systemPrompt += `- NEVER suggest shrimp burgers, crab cakes, lobster rolls, seafood paella, or ANY dish containing shellfish\n`;
            systemPrompt += `- SAFE ALTERNATIVES: Fish (salmon, tuna, cod, etc.) and plant-based options are safe\n`;
            systemPrompt += `- If suggesting seafood, ONLY suggest finned fish - NEVER shellfish\n`;
            systemPrompt += `- Shrimp is a CRUSTACEAN and is ABSOLUTELY FORBIDDEN under shellfish allergy\n\n`;
          }
          
          if (allergensList.includes('nuts')) {
            systemPrompt += `🚨 NUT ALLERGY DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: ALL tree nuts (almonds, walnuts, cashews, pistachios, etc.), peanuts, and nut-based ingredients\n`;
            systemPrompt += `- Check for hidden nuts in sauces, oils, and seasonings\n\n`;
          }
          
          if (allergensList.includes('dairy')) {
            systemPrompt += `🚨 DAIRY ALLERGY DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: Milk, cheese, butter, cream, yogurt, and all dairy products\n`;
            systemPrompt += `- Use dairy-free alternatives in suggestions\n\n`;
          }
          
          if (allergensList.includes('eggs')) {
            systemPrompt += `🚨 EGG ALLERGY DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: Eggs in any form (scrambled, baked, as binding agent, etc.)\n`;
            systemPrompt += `- Use egg-free alternatives for binding in recipes\n\n`;
          }
          
          if (allergensList.includes('fish')) {
            systemPrompt += `🚨 FISH ALLERGY DETECTED:\n`;
            systemPrompt += `- FORBIDDEN: ALL finned fish (salmon, tuna, cod, etc.)\n`;
            systemPrompt += `- Use plant-based or other protein alternatives\n\n`;
          }
          
          systemPrompt += `\n🚨 CRITICAL ALLERGEN ENFORCEMENT RULES:\n`;
          systemPrompt += `1. ALLERGENS ARE MORE DANGEROUS THAN RESTRICTIONS - THIS IS A LIFE SAFETY ISSUE\n`;
          systemPrompt += `2. BEFORE suggesting ANY recipe, ingredient, or dish, verify it contains ZERO allergens\n`;
          systemPrompt += `3. When listing protein or ingredient options, ABSOLUTELY EXCLUDE all allergenic items\n`;
          systemPrompt += `4. If user asks about an allergenic food, respond: "I can't suggest [food] because you're allergic to [allergen]. This could be dangerous. How about [safe alternative] instead?"\n`;
          systemPrompt += `5. NEVER mention allergenic foods even as "alternatives you could try" - they are completely off-limits\n`;
          systemPrompt += `6. This is a MEDICAL SAFETY issue - violations could cause serious harm\n\n`;
        }

        systemPrompt += `\n🔒 FINAL MANDATORY ENFORCEMENT RULES (APPLY TO BOTH RESTRICTIONS AND ALLERGENS):\n`;
        systemPrompt += `1. BEFORE suggesting ANY protein, ingredient, or dish, verify it complies with ALL restrictions AND allergens above\n`;
        systemPrompt += `2. When listing options, ONLY list compliant and safe options - DO NOT list forbidden or allergenic items\n`;
        systemPrompt += `3. If user asks about a restricted/allergenic food, immediately decline and suggest a safe alternative\n`;
        systemPrompt += `4. NEVER suggest, mention, or even hint at restricted/allergenic foods as options\n`;
        systemPrompt += `5. This is a SAFETY and RESPECT issue - violations are UNACCEPTABLE and DANGEROUS\n\n`;
      }

      // Add unavailable equipment enforcement
      if (profile.unavailableEquipment && profile.unavailableEquipment.length > 0) {
        systemPrompt += `\n\n🚫🚫🚫 UNAVAILABLE EQUIPMENT - ABSOLUTE ENFORCEMENT REQUIRED 🚫🚫🚫\n`;
        systemPrompt += `THE USER DOES NOT HAVE ACCESS TO: ${profile.unavailableEquipment.join(', ').toUpperCase()}\n`;
        systemPrompt += `DO NOT suggest, recommend, or discuss recipes that require these items.\n`;
        systemPrompt += `If the user asks about a dish that requires unavailable equipment, politely redirect them to an alternative method or dish.\n`;
        systemPrompt += `This is a hard constraint - never suggest recipes requiring unavailable equipment.\n\n`;
      }

      // Optional: Add preferences (likes/dislikes) for personalization
      if (profile.likes && profile.likes.length > 0) {
        systemPrompt += `\n✅ User prefers: ${profile.likes.join(', ')}. You can emphasize these preferences when relevant.\n`;
      }
      if (profile.dislikes && profile.dislikes.length > 0) {
        systemPrompt += `\n❌ User dislikes: ${profile.dislikes.join(', ')}. Avoid emphasizing these.\n`;
      }

      // Add cooking proficiency to system prompt
      if (profile.cookingProficiency) {
        const proficiencyLabels: Record<number, string> = {
          1: 'Beginner',
          2: 'Novice',
          3: 'Intermediate',
          4: 'Experienced',
          5: 'Advanced',
        };
        const proficiencyLabel = proficiencyLabels[profile.cookingProficiency] || profile.cookingProficiency.toString();
        systemPrompt += `\n👨‍🍳 User cooking skill level: ${proficiencyLabel} (${profile.cookingProficiency}/5). Adjust recipe complexity and instructions accordingly. For beginners, provide more detailed step-by-step instructions. For advanced cooks, you can assume knowledge of techniques and terminology.\n`;
      }
    }

    // Generate AI response using Claude
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: conversationHistory
    });

    // Extract the AI response
    let aiResponse = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        aiResponse += block.text;
      }
    }

    return c.json({ response: aiResponse });

  } catch (error) {
    console.error('Error generating AI response:', error);
    return c.json({ error: 'Failed to generate AI response' }, 500);
  }
});

/**
 * Load a recipe into chat for editing
 * POST /chat/load-recipe
 */
app.post('/load-recipe', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const body = await c.req.json();
    const { conversationID, recipeID, userID } = body;

    if (!conversationID || !recipeID || !userID) {
      return c.json({ error: 'conversationID, recipeID, and userID are required' }, 400);
    }

    const conversationContainer = getContainer('chatConversations');
    const recipesContainer = getContainer('recipes');
    
    if (!conversationContainer || !recipesContainer) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Verify recipe exists and belongs to user
    const { resource: recipe } = await recipesContainer
      .item(recipeID, userID)
      .read();
    
    if (!recipe) {
      return c.json({ error: 'Recipe not found' }, 404);
    }

    if (recipe.userID !== userID) {
      return c.json({ error: 'Unauthorized: Recipe does not belong to user' }, 403);
    }

    // Update conversation with recipe editing context
    const { resource: conversation } = await conversationContainer
      .item(conversationID, conversationID)
      .read<ChatConversation>();

    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    conversation.status = 'editing_recipe';
    conversation.editingRecipeID = recipeID;
    conversation.updatedAt = new Date().toISOString();
    await conversationContainer.item(conversationID, conversationID).replace(conversation);

    // Send initial message about the recipe
    const messageContainer = getContainer('chatMessages');
    if (messageContainer) {
      // Get current message count
      const { resources: existingMessages } = await messageContainer.items
        .query({
          query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex DESC OFFSET 0 LIMIT 1',
          parameters: [{ name: '@conversationID', value: conversationID }],
        })
        .fetchAll();

      const messageIndex = existingMessages.length > 0 ? existingMessages[0].messageIndex + 1 : 0;
      const messageId = generateId('msg');

      const message = {
        id: messageId,
        conversationID,
        messageIndex,
        role: 'assistant',
        content: `I've loaded your recipe "${recipe.recipeData.title}". How would you like to modify it? For example, you can ask me to make it vegetarian, adjust the servings, change ingredients, or modify the instructions.`,
        timestamp: new Date().toISOString(),
      };

      await messageContainer.items.create(message);
    }

    return c.json({ 
      success: true, 
      conversation,
      recipe: {
        id: recipe.recipeID,
        title: recipe.recipeData.title,
      }
    }, 200);
  } catch (error) {
    console.error('Error loading recipe into chat:', error);
    return c.json({ error: 'Failed to load recipe into chat' }, 500);
  }
});

/**
 * Save edited recipe as a new recipe
 * POST /chat/save-edited-recipe
 */
app.post('/save-edited-recipe', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Chat service not available' }, 503);
  }

  try {
    const body = await c.req.json();
    const { conversationID, userID } = body;

    if (!conversationID || !userID) {
      return c.json({ error: 'conversationID and userID are required' }, 400);
    }

    const conversationContainer = getContainer('chatConversations');
    const recipesContainer = getContainer('recipes');
    const messagesContainer = getContainer('chatMessages');
    
    if (!conversationContainer || !recipesContainer || !messagesContainer) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Get conversation
    const { resource: conversation } = await conversationContainer
      .item(conversationID, conversationID)
      .read<ChatConversation>();

    if (!conversation || conversation.status !== 'editing_recipe' || !conversation.editingRecipeID) {
      return c.json({ error: 'No recipe being edited in this conversation' }, 400);
    }

    // Get original recipe
    const { resource: originalRecipe } = await recipesContainer
      .item(conversation.editingRecipeID, userID)
      .read();

    if (!originalRecipe) {
      return c.json({ error: 'Original recipe not found' }, 404);
    }

    // Get conversation messages
    const { resources: messages } = await messagesContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.conversationID = @conversationID ORDER BY c.messageIndex ASC',
        parameters: [{ name: '@conversationID', value: conversationID }],
      })
      .fetchAll();

    if (messages.length === 0) {
      return c.json({ error: 'No messages in conversation' }, 400);
    }

    // Get user profile for formatting
    let profile: FoodProfile | null = null;
    const profileContainer = getContainer('userProfiles');
    if (profileContainer) {
      try {
        const { resource } = await profileContainer.item(userID, userID).read<FoodProfile>();
        profile = resource || null;
      } catch (error) {
        // Profile not found, continue without it
      }
    }

    // Use recipe formatter to extract modified recipe from conversation
    // Build a prompt that includes the full conversation
    const conversationText = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const { formatRecipe } = await import('../services/recipe-formatter');
    
    // Create a synthetic scraped content from the conversation
    // The AI has already described the modified recipe in the conversation
    const scrapedContent = `Modified Recipe Conversation:\n\n${conversationText}\n\n` +
      `Original Recipe:\n` +
      `Title: ${originalRecipe.recipeData.title}\n` +
      `Description: ${originalRecipe.recipeData.description}\n` +
      `Portions: ${originalRecipe.recipeData.portions}\n` +
      `Ingredients: ${originalRecipe.recipeData.ingredients.join(', ')}\n` +
      `Instructions: ${originalRecipe.recipeData.instructions.join('; ')}`;

    // Format the modified recipe
    let modifiedRecipeData: RecipeData;
    try {
      console.log('🔄 Formatting edited recipe from conversation...');
      modifiedRecipeData = await formatRecipe(scrapedContent, originalRecipe.recipeData.sourceUrl, profile);
      console.log(`✅ Recipe formatted successfully: ${modifiedRecipeData.title}`);
    } catch (formatError) {
      console.error('❌ Failed to format edited recipe:', formatError);
      const errorMessage = formatError instanceof Error ? formatError.message : 'Unknown formatting error';
      return c.json({ 
        error: `Failed to format edited recipe: ${errorMessage}. The AI may have had trouble extracting the recipe changes from the conversation.` 
      }, 500);
    }

    // Preserve image URL from original (always keep it, we'll add an "Edited" banner in UI)
    if (!modifiedRecipeData.imageUrl && originalRecipe.recipeData.imageUrl) {
      modifiedRecipeData.imageUrl = originalRecipe.recipeData.imageUrl;
    }

    // Create new recipe (don't overwrite original)
    const recipeID = generateId('recipe');
    const now = new Date().toISOString();

    const newRecipe: Recipe = {
      id: recipeID,
      userID,
      recipeID,
      recipeNameLower: modifiedRecipeData.title.toLowerCase(),
      sourceUrlLower: originalRecipe.sourceUrlLower,
      recipeData: modifiedRecipeData,
      isSaved: false,
      isEdited: true, // Mark as edited
      originalRecipeID: originalRecipe.recipeID, // Link to original
      createdAt: now,
      updatedAt: now,
    };

    try {
      await recipesContainer.items.create(newRecipe);
      console.log(`✅ Edited recipe saved as new recipe: ${recipeID}`);
    } catch (createError) {
      console.error('❌ Failed to create recipe in database:', createError);
      return c.json({ 
        error: `Failed to save recipe to database: ${createError instanceof Error ? createError.message : 'Unknown error'}` 
      }, 500);
    }

    // Update conversation status
    try {
      conversation.status = 'recipe_found';
      conversation.recipeID = recipeID;
      conversation.updatedAt = new Date().toISOString();
      await conversationContainer.item(conversationID, conversationID).replace(conversation);
    } catch (updateError) {
      console.error('⚠️ Failed to update conversation status (recipe was saved):', updateError);
      // Don't fail the request if conversation update fails - recipe was already saved
    }

    return c.json({ 
      recipe: newRecipe,
      message: 'Recipe saved successfully!'
    }, 201);
  } catch (error) {
    console.error('❌ Unexpected error saving edited recipe:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ 
      error: `Failed to save edited recipe: ${errorMessage}` 
    }, 500);
  }
});

export default app;

