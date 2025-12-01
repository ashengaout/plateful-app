import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@plateful/shared';
import Header from '../../src/components/Header';
import { auth } from '../../src/config/firebase';
import { createCheckoutSession, checkSubscriptionStatus } from '../../src/services/payments';
import { API_BASE } from '../../src/config/api';

export default function UpgradeScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const [loading, setLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    isPremium: boolean;
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    if (user) {
      loadSubscriptionStatus();
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [user]);

  const loadSubscriptionStatus = async () => {
    if (!user) return;

    try {
      setCheckingStatus(true);
      const status = await checkSubscriptionStatus(user.uid);
      setSubscriptionStatus(status);
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleUpgrade = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Create checkout session
      const { checkoutUrl } = await createCheckoutSession(
        user.uid,
        `${API_BASE}/upgrade?success=true`,
        `${API_BASE}/upgrade?canceled=true`
      );

      // Open Stripe Checkout in browser
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
        
        // Poll for subscription status after a delay
        setTimeout(() => {
          loadSubscriptionStatus();
        }, 3000);
      } else {
        Alert.alert('Error', 'Cannot open payment page');
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start checkout';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  if (checkingStatus) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading subscription status...</Text>
      </View>
    );
  }

  const isPremium = subscriptionStatus?.isPremium || false;

  return (
    <View style={styles.container}>
      <Header title="Upgrade to Premium" showBackButton />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {isPremium ? (
          <View style={styles.premiumActiveContainer}>
            <View style={styles.premiumBadge}>
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
            </View>
            <Text style={styles.premiumTitle}>You're a Premium Member!</Text>
            <Text style={styles.premiumMessage}>
              Thank you for subscribing. You have access to all premium features.
            </Text>
            {subscriptionStatus?.subscriptionCurrentPeriodEnd && (
              <View style={styles.statusInfo}>
                <Text style={styles.statusLabel}>Renews on:</Text>
                <Text style={styles.statusValue}>
                  {formatDate(subscriptionStatus.subscriptionCurrentPeriodEnd)}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Unlock Premium Features</Text>
              <Text style={styles.subtitle}>
                Get access to advanced customization options
              </Text>
            </View>

            <View style={styles.featuresContainer}>
              <Text style={styles.featuresTitle}>Premium Benefits:</Text>
              
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                <Text style={styles.featureText}>
                  Custom likes, dislikes, and allergens
                </Text>
              </View>
              
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                <Text style={styles.featureText}>
                  Unlimited custom preferences
                </Text>
              </View>
              
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                <Text style={styles.featureText}>
                  Enhanced recipe personalization
                </Text>
              </View>
            </View>

            <View style={styles.pricingContainer}>
              <Text style={styles.pricingTitle}>Monthly Subscription</Text>
              <Text style={styles.pricingAmount}>$9.99/month</Text>
              <Text style={styles.pricingNote}>
                Cancel anytime. Billed monthly.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.upgradeButton, loading && styles.upgradeButtonDisabled]}
              onPress={handleUpgrade}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <>
                  <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.surface} />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.disclaimer}>
              Payment is processed securely through Stripe. You can cancel your subscription at any time.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  featuresContainer: {
    marginBottom: 32,
    padding: 20,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: 12,
    flex: 1,
  },
  pricingContainer: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    alignItems: 'center',
  },
  pricingTitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  pricingAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  pricingNote: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 16,
  },
  upgradeButtonDisabled: {
    opacity: 0.6,
  },
  upgradeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.surface,
    marginRight: 8,
  },
  disclaimer: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  premiumActiveContainer: {
    alignItems: 'center',
    padding: 32,
  },
  premiumBadge: {
    marginBottom: 16,
  },
  premiumTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  premiumMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  statusInfo: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 200,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

