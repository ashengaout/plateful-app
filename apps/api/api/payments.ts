import { Hono } from 'hono';
import Stripe from 'stripe';
import { getContainer, isCosmosAvailable } from '../lib/cosmos';
import type { FoodProfile } from '@plateful/shared';

const app = new Hono();

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-11-17.clover',
});

/**
 * Health check for payments route
 * GET /payments
 */
app.get('/', async (c) => {
  return c.json({ status: 'ok', service: 'payments' });
});

/**
 * Create Stripe Checkout session for monthly subscription
 * POST /payments/create-checkout
 */
app.post('/create-checkout', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Payment service not available' }, 503);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  try {
    const { userID, successUrl, cancelUrl } = await c.req.json<{
      userID: string;
      successUrl?: string;
      cancelUrl?: string;
    }>();

    if (!userID) {
      return c.json({ error: 'userID is required' }, 400);
    }

    // Get or create user profile to check for existing Stripe customer
    const container = getContainer('userProfiles');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    let profile: FoodProfile | null = null;
    try {
      const response = await container.item(userID, userID).read();
      profile = (response.resource as FoodProfile) || null;
    } catch (error: any) {
      if (error?.code !== 404 && error?.code !== 'NotFound' && error?.statusCode !== 404) {
        console.error('Error fetching profile:', error);
      }
    }

    // Get or create Stripe customer
    let customerId = profile?.stripeCustomerId;
    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        metadata: {
          userID: userID,
        },
      });
      customerId = customer.id;

      // Update profile with customer ID if profile exists
      if (profile) {
        profile.stripeCustomerId = customerId;
        profile.updatedAt = new Date().toISOString();
        await container.items.upsert(profile);
      }
    }

    // Get the price ID from environment (or use a default test price)
    // In production, create a price in Stripe Dashboard and set PRICE_ID env var
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return c.json({ 
        error: 'Stripe price ID not configured. Please set STRIPE_PRICE_ID environment variable.' 
      }, 500);
    }

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3001'}/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3001'}/upgrade?canceled=true`,
      metadata: {
        userID: userID,
      },
      subscription_data: {
        metadata: {
          userID: userID,
        },
      },
    });

    return c.json({ 
      checkoutUrl: session.url,
      sessionId: session.id 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session';
    return c.json({ error: errorMessage }, 500);
  }
});

/**
 * Handle Stripe webhooks
 * POST /payments/webhook
 */
app.post('/webhook', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Payment service not available' }, 503);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return c.json({ error: 'Webhook secret not configured' }, 500);
  }

  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'Missing stripe-signature header' }, 400);
    }

    const body = await c.req.text();
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return c.json({ error: 'Invalid signature' }, 400);
    }

    const container = getContainer('userProfiles');
    if (!container) {
      console.error('Database not available for webhook');
      return c.json({ error: 'Database not available' }, 503);
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userID = session.metadata?.userID;
        
        if (!userID) {
          console.error('No userID in checkout session metadata');
          return c.json({ error: 'Missing userID' }, 400);
        }

        const customerId = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer?.id || '';

        // Ensure customer ID is saved to profile first
        try {
          let profile: FoodProfile | null = null;
          try {
            const response = await container.item(userID, userID).read();
            profile = (response.resource as FoodProfile) || null;
          } catch (error: any) {
            if (error?.code !== 404 && error?.code !== 'NotFound' && error?.statusCode !== 404) {
              console.error('Error reading profile:', error);
            }
          }

          if (profile && customerId && !profile.stripeCustomerId) {
            profile.stripeCustomerId = customerId;
            profile.updatedAt = new Date().toISOString();
            await container.items.upsert(profile);
            console.log(`✅ Saved customer ID ${customerId} to profile for user ${userID}`);
          }
        } catch (error) {
          console.error('Error saving customer ID to profile:', error);
        }

        // Get subscription details
        const subscriptionId = typeof session.subscription === 'string' 
          ? session.subscription 
          : session.subscription?.id;
        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await updateProfileSubscriptionStatus(
              container,
              userID,
              subscription,
              customerId
            );
            console.log(`✅ Updated profile subscription status from checkout.session.completed for user ${userID}`);
          } catch (error) {
            console.error('Error retrieving subscription in checkout.session.completed:', error);
            // Don't fail the webhook - subscription.created will handle it
          }
        } else {
          console.log('No subscription ID in checkout session');
        }

        return c.json({ received: true });
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        let userID = subscription.metadata?.userID;
        
        // If userID not in subscription metadata, try to get it from customer metadata
        if (!userID && subscription.customer) {
          try {
            const customerId = typeof subscription.customer === 'string' 
              ? subscription.customer 
              : subscription.customer.id;
            const customer = await stripe.customers.retrieve(customerId);
            // Check if customer is deleted
            if (customer && !customer.deleted && 'metadata' in customer) {
              userID = customer.metadata?.userID;
            }
          } catch (error) {
            console.error('Error retrieving customer for userID:', error);
          }
        }
        
        if (!userID) {
          console.error('No userID in subscription or customer metadata');
          // Don't fail the webhook - just log and return success
          // The checkout.session.completed event will handle the update
          console.log('Skipping subscription update - userID not found. Will be handled by checkout.session.completed');
          return c.json({ received: true, skipped: 'No userID found' });
        }

        await updateProfileSubscriptionStatus(
          container,
          userID,
          subscription,
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || ''
        );

        return c.json({ received: true });
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        let userID = subscription.metadata?.userID;
        
        // If userID not in subscription metadata, try to get it from customer metadata
        if (!userID && subscription.customer) {
          try {
            const customerId = typeof subscription.customer === 'string' 
              ? subscription.customer 
              : subscription.customer.id;
            const customer = await stripe.customers.retrieve(customerId);
            // Check if customer is deleted
            if (customer && !customer.deleted && 'metadata' in customer) {
              userID = customer.metadata?.userID;
            }
          } catch (error) {
            console.error('Error retrieving customer for userID:', error);
          }
        }
        
        if (!userID) {
          console.error('No userID in subscription or customer metadata');
          return c.json({ error: 'Missing userID' }, 400);
        }

        // Update profile to remove premium status
        try {
          const { resource: profile } = await container
            .item(userID, userID)
            .read<FoodProfile>();

          if (profile) {
            profile.isPremium = false;
            profile.subscriptionStatus = 'canceled';
            profile.updatedAt = new Date().toISOString();
            await container.items.upsert(profile);
            console.log(`✅ Updated profile for user ${userID}: subscription canceled`);
          }
        } catch (error) {
          console.error(`Error updating profile for canceled subscription:`, error);
        }

        return c.json({ received: true });
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        return c.json({ received: true });
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

/**
 * Helper function to update profile subscription status
 */
async function updateProfileSubscriptionStatus(
  container: any,
  userID: string,
  subscription: Stripe.Subscription,
  customerId: string
) {
  try {
    let profile: FoodProfile | null = null;
    try {
      const response = await container.item(userID, userID).read();
      profile = (response.resource as FoodProfile) || null;
    } catch (error: any) {
      if (error?.code !== 404 && error?.code !== 'NotFound' && error?.statusCode !== 404) {
        throw error;
      }
    }

    const now = new Date().toISOString();
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';

    // Safely get currentPeriodEnd - handle both camelCase and snake_case, and null/undefined
    const currentPeriodEnd = (subscription as any).currentPeriodEnd || (subscription as any).current_period_end;
    const subscriptionCurrentPeriodEnd = currentPeriodEnd && typeof currentPeriodEnd === 'number' && !isNaN(currentPeriodEnd)
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : undefined;

    if (profile) {
      // Update existing profile
      profile.isPremium = isActive;
      profile.stripeCustomerId = customerId;
      profile.stripeSubscriptionId = subscription.id;
      profile.subscriptionStatus = subscription.status as any;
      profile.subscriptionCurrentPeriodEnd = subscriptionCurrentPeriodEnd;
      
      if (isActive && !profile.premiumPurchasedAt) {
        profile.premiumPurchasedAt = now;
      }
      
      profile.updatedAt = now;
      await container.items.upsert(profile);
      console.log(`✅ Updated profile for user ${userID}: isPremium=${isActive}, status=${subscription.status}`);
    } else {
      // Create new profile with subscription info
      const newProfile: FoodProfile = {
        id: userID,
        userID,
        likes: [],
        dislikes: [],
        allergens: [],
        restrictions: [],
        isPremium: isActive,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status as any,
        subscriptionCurrentPeriodEnd: subscriptionCurrentPeriodEnd,
        premiumPurchasedAt: isActive ? now : undefined,
        createdAt: now,
        updatedAt: now,
      };
      await container.items.create(newProfile);
      console.log(`✅ Created profile for user ${userID} with subscription`);
    }
  } catch (error) {
    console.error(`Error updating profile subscription status for user ${userID}:`, error);
    throw error;
  }
}

/**
 * Get subscription status for a user
 * GET /payments/status/:userID
 */
app.get('/status/:userID', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Payment service not available' }, 503);
  }

  try {
    const userID = c.req.param('userID');
    const container = getContainer('userProfiles');
    
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    let profile: FoodProfile | null = null;
    try {
      const response = await container.item(userID, userID).read();
      profile = (response.resource as FoodProfile) || null;
    } catch (error: any) {
      if (error?.code !== 404 && error?.code !== 'NotFound' && error?.statusCode !== 404) {
        console.error('Error reading profile:', error);
      }
    }

    if (!profile) {
      return c.json({ 
        isPremium: false,
        subscriptionStatus: null 
      });
    }

    // If user has a Stripe customer ID but subscription status might be stale, sync from Stripe
    const sync = c.req.query('sync') === 'true';
    if (sync && process.env.STRIPE_SECRET_KEY) {
      try {
        let customerId = profile?.stripeCustomerId;
        
        // If no customer ID in profile, try to find customer by userID in metadata
        if (!customerId) {
          console.log(`No stripeCustomerId in profile for user ${userID}, searching by metadata...`);
          const customers = await stripe.customers.search({
            query: `metadata['userID']:'${userID}'`,
            limit: 1,
          });
          
          if (customers.data.length > 0) {
            customerId = customers.data[0].id;
            console.log(`Found customer ${customerId} for user ${userID}`);
            
            // Update profile with customer ID
            if (profile) {
              profile.stripeCustomerId = customerId;
              profile.updatedAt = new Date().toISOString();
              await container.items.upsert(profile);
            }
          } else {
            console.log(`No customer found for user ${userID}`);
            return c.json({
              isPremium: profile?.isPremium || false,
              subscriptionStatus: profile?.subscriptionStatus || null,
              subscriptionCurrentPeriodEnd: profile?.subscriptionCurrentPeriodEnd || null,
              stripeCustomerId: null,
            });
          }
        }

        // Fetch customer's subscriptions from Stripe
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          console.log(`Found subscription ${subscription.id} with status ${subscription.status} for user ${userID}`);
          
          // Update profile with latest subscription info
          await updateProfileSubscriptionStatus(
            container,
            userID,
            subscription,
            customerId
          );
          
          // Re-read the updated profile
          const updatedResponse = await container.item(userID, userID).read();
          profile = (updatedResponse.resource as FoodProfile) || null;
          console.log(`✅ Synced subscription status for user ${userID} from Stripe`);
        } else {
          console.log(`No active subscriptions found for customer ${customerId}`);
        }
      } catch (error) {
        console.error('Error syncing subscription from Stripe:', error);
        // Continue with existing profile data if sync fails
      }
    }

    return c.json({
      isPremium: profile?.isPremium || false,
      subscriptionStatus: profile?.subscriptionStatus || null,
      subscriptionCurrentPeriodEnd: profile?.subscriptionCurrentPeriodEnd || null,
      stripeCustomerId: profile?.stripeCustomerId || null,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return c.json({ error: 'Failed to fetch subscription status' }, 500);
  }
});

/**
 * Cancel subscription for a user
 * POST /payments/cancel-subscription
 */
app.post('/cancel-subscription', async (c) => {
  if (!isCosmosAvailable()) {
    return c.json({ error: 'Payment service not available' }, 503);
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe not configured' }, 503);
  }

  try {
    const { userID } = await c.req.json<{ userID: string }>();

    if (!userID) {
      return c.json({ error: 'userID is required' }, 400);
    }

    const container = getContainer('userProfiles');
    if (!container) {
      return c.json({ error: 'Database not available' }, 503);
    }

    // Get user profile
    let profile: FoodProfile | null = null;
    try {
      const response = await container.item(userID, userID).read();
      profile = (response.resource as FoodProfile) || null;
    } catch (error: any) {
      if (error?.code !== 404 && error?.code !== 'NotFound' && error?.statusCode !== 404) {
        console.error('Error fetching profile:', error);
        return c.json({ error: 'Failed to fetch profile' }, 500);
      }
    }

    if (!profile || !profile.stripeSubscriptionId) {
      return c.json({ error: 'No active subscription found' }, 404);
    }

    // Cancel the subscription in Stripe
    const subscription = await stripe.subscriptions.cancel(profile.stripeSubscriptionId);

    // Update profile to reflect canceled subscription
    profile.isPremium = false;
    profile.subscriptionStatus = 'canceled';
    profile.updatedAt = new Date().toISOString();
    await container.items.upsert(profile);

    console.log(`✅ Canceled subscription for user ${userID}`);

    return c.json({ 
      success: true,
      message: 'Subscription canceled successfully',
      subscriptionStatus: 'canceled'
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
    return c.json({ error: errorMessage }, 500);
  }
});

export default app;

