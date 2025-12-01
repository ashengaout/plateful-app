import { API_BASE } from '../config/api';

export interface SubscriptionStatus {
  isPremium: boolean;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  stripeCustomerId: string | null;
}

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
}

/**
 * Create a Stripe Checkout session for monthly subscription
 */
export const createCheckoutSession = async (
  userID: string,
  successUrl?: string,
  cancelUrl?: string
): Promise<CheckoutSessionResponse> => {
  try {
    const response = await fetch(`${API_BASE}/api/payments/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userID,
        successUrl,
        cancelUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `Failed to create checkout session: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create checkout session';
    throw new Error(errorMessage);
  }
};

/**
 * Check subscription status for a user
 * @param userID - The user ID to check
 * @param syncFromStripe - If true, syncs the latest subscription status from Stripe (useful after payment)
 */
export const checkSubscriptionStatus = async (
  userID: string,
  syncFromStripe: boolean = false
): Promise<SubscriptionStatus> => {
  try {
    const url = `${API_BASE}/api/payments/status/${userID}${syncFromStripe ? '?sync=true' : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `Failed to check subscription status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    // Return default non-premium status on error
    return {
      isPremium: false,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEnd: null,
      stripeCustomerId: null,
    };
  }
};

/**
 * Cancel subscription for a user
 */
export const cancelSubscription = async (userID: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${API_BASE}/api/payments/cancel-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userID }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || `Failed to cancel subscription: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
    throw new Error(errorMessage);
  }
};

