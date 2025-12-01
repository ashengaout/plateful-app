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
 */
export const checkSubscriptionStatus = async (userID: string): Promise<SubscriptionStatus> => {
  try {
    const response = await fetch(`${API_BASE}/api/payments/status/${userID}`, {
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

