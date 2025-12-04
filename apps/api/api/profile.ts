import { Hono } from 'hono';
import { getContainer, isCosmosAvailable } from '../lib/cosmos';
import type { FoodProfile } from '@plateful/shared';
import { COMMON_LIKES, COMMON_DISLIKES, COMMON_ALLERGENS } from '@plateful/shared';

const app = new Hono();

/**
 * Health check for profile route
 * GET /profile
 */
app.get('/', async (c) => {
  return c.json({ status: 'ok', service: 'profile' });
});

/**
 * Get user profile
 * GET /profile/:userID
 */
app.get('/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Profile service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const container = getContainer('userProfiles');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    const { resource: profile } = await container
      .item(userID, userID)
      .read<FoodProfile>();

    if (!profile) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    return c.json({ profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return c.json({ error: 'Failed to fetch profile' }, 500);
  }
});

/**
 * Create or update user profile
 * PUT /profile/:userID
 */
app.put('/:userID', async (c) => {
  console.log(`📝 PUT /api/profile/:userID - Received request`);
  
  if (!isCosmosAvailable()) {
    console.log('❌ Cosmos DB not available');
    return c.json({ error: 'Profile service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    console.log(`📝 Processing profile update for user: ${userID}`);
    
    const body = await c.req.json<Partial<FoodProfile>>();
    const { likes = [], dislikes = [], allergens = [], restrictions = [], unavailableEquipment, displayName, timezone, cookingProficiency, defaultServingSize, dailyMacroTargets } = body;

    const container = getContainer('userProfiles');
    if (!container) {
      console.log('❌ userProfiles container not available');
      return c.json({ error: 'Database not available' }, 503);
    }
    
    console.log(`✅ Container found, processing profile update...`);

    // Check if profile exists and get premium status
    let existingProfile: FoodProfile | null = null;
    let isPremium = false;
    try {
      const response = await container.item(userID, userID).read<FoodProfile>();
      existingProfile = response.resource || null;
      isPremium = existingProfile?.isPremium || false;
    } catch (error: any) {
      // Profile doesn't exist yet (404 is expected), will create new one
      // Cosmos DB throws 404 when item doesn't exist - this is normal
      if (error?.code === 404 || error?.code === 'NotFound' || error?.statusCode === 404) {
        console.log(`ℹ️ Profile doesn't exist yet for user ${userID}, creating new one`);
      } else {
        console.warn('Unexpected error checking for existing profile:', error);
        // Don't throw - we'll still try to create the profile
      }
    }

    // Validate premium features: ALL preferences require premium
    if (!isPremium) {
      // Block ALL preferences if not premium
      if (likes.length > 0 || dislikes.length > 0 || allergens.length > 0 || restrictions.length > 0) {
        return c.json({ 
          error: 'Premium subscription required for all preferences',
          details: {
            likes: likes.length,
            dislikes: dislikes.length,
            allergens: allergens.length,
            restrictions: restrictions.length,
          }
        }, 403);
      }
    }

    const now = new Date().toISOString();
    const profile: FoodProfile = {
      id: userID,
      userID,
      displayName: displayName !== undefined ? (displayName.trim() || undefined) : existingProfile?.displayName,
      timezone: timezone !== undefined ? (timezone.trim() || 'America/New_York') : (existingProfile?.timezone || 'America/New_York'),
      cookingProficiency: cookingProficiency !== undefined ? cookingProficiency : (existingProfile?.cookingProficiency || undefined),
      defaultServingSize: defaultServingSize !== undefined ? defaultServingSize : (existingProfile?.defaultServingSize || undefined),
      dailyMacroTargets: dailyMacroTargets !== undefined ? dailyMacroTargets : existingProfile?.dailyMacroTargets,
      likes: Array.isArray(likes) ? likes : [],
      dislikes: Array.isArray(dislikes) ? dislikes : [],
      allergens: Array.isArray(allergens) ? allergens : [],
      restrictions: Array.isArray(restrictions) ? restrictions : [],
      preferredEquipment: [], // Preferred equipment feature has been removed
      unavailableEquipment: unavailableEquipment !== undefined ? (Array.isArray(unavailableEquipment) ? unavailableEquipment : []) : existingProfile?.unavailableEquipment,
      // Preserve subscription fields from existing profile
      isPremium: existingProfile?.isPremium || false,
      premiumPurchasedAt: existingProfile?.premiumPurchasedAt,
      stripeCustomerId: existingProfile?.stripeCustomerId,
      stripeSubscriptionId: existingProfile?.stripeSubscriptionId,
      subscriptionStatus: existingProfile?.subscriptionStatus,
      subscriptionCurrentPeriodEnd: existingProfile?.subscriptionCurrentPeriodEnd,
      createdAt: existingProfile?.createdAt || now,
      updatedAt: now,
    };

    console.log(`💾 Upserting profile with ${profile.likes.length} likes, ${profile.allergens.length} allergens`);
    await container.items.upsert(profile);
    console.log(`✅ Profile upserted successfully`);

    return c.json({ profile }, existingProfile ? 200 : 201);
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as any)?.code;
    console.error('Error details:', { errorMessage, errorCode, error });
    return c.json({ 
      error: 'Failed to update profile',
      details: errorMessage,
      code: errorCode 
    }, 500);
  }
});

export default app;

