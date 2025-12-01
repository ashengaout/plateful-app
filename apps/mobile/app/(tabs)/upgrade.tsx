import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Modal,
  TextInput,
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
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscriptionStatus();
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [user]);

  // Handle deep links when returning from payment
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      if (url.includes('upgrade') && (url.includes('success=true') || url.includes('canceled=true'))) {
        // User returned from payment, sync subscription status from Stripe
        console.log('Deep link received, syncing subscription status from Stripe');
        setTimeout(() => {
          loadSubscriptionStatus(true); // Pass true to sync from Stripe
        }, 2000); // Wait a moment for webhook to process
      }
    };

    // Check initial URL (if app was opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, []);

  const loadSubscriptionStatus = async (syncFromStripe: boolean = false) => {
    if (!user) return;

    try {
      setCheckingStatus(true);
      const status = await checkSubscriptionStatus(user.uid, syncFromStripe);
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

      // Create checkout session with API success/cancel URLs
      // The API will show a success page that tries to deep link back to the app
      const apiBase = API_BASE;
      const { checkoutUrl: url } = await createCheckoutSession(
        user.uid,
        `${apiBase}/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
        `${apiBase}/upgrade?canceled=true`
      );

      // Show URL modal instead of opening browser directly
      // This prevents emulator crashes
      setCheckoutUrl(url);
      setShowUrlModal(true);
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

      {/* URL Modal - Shows checkout URL to prevent crashes */}
      <Modal
        visible={showUrlModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowUrlModal(false);
          setCheckoutUrl(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Complete Payment</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowUrlModal(false);
                  setCheckoutUrl(null);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              To complete your payment, please open this URL in your browser:
            </Text>

            {checkoutUrl && (
              <View style={styles.urlContainer}>
                <TextInput
                  style={styles.urlInput}
                  value={checkoutUrl}
                  editable={false}
                  multiline
                  selectTextOnFocus
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.openButton]}
                onPress={async () => {
                  if (checkoutUrl) {
                    try {
                      // Try to open URL - this is safer than WebBrowser
                      const canOpen = await Linking.canOpenURL(checkoutUrl);
                      if (canOpen) {
                        await Linking.openURL(checkoutUrl);
                        // Close modal and sync status from Stripe after a delay
                        setShowUrlModal(false);
                        setTimeout(() => {
                          loadSubscriptionStatus(true); // Sync from Stripe
                        }, 3000);
                      } else {
                        Alert.alert('Error', 'Cannot open this URL. Please copy it manually.');
                      }
                    } catch (error) {
                      console.error('Failed to open URL:', error);
                      Alert.alert('Error', 'Failed to open URL. Please copy it manually.');
                    }
                  }
                }}
              >
                <Ionicons name="open-outline" size={20} color={colors.surface} />
                <Text style={styles.modalButtonText}>Open in Browser</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.copyButton]}
                onPress={() => {
                  if (checkoutUrl) {
                    // For now, just show an alert with the URL
                    // In a real app, you'd use Clipboard API
                    Alert.alert(
                      'Payment URL',
                      checkoutUrl,
                      [
                        {
                          text: 'OK',
                          onPress: () => {
                            console.log('Payment URL:', checkoutUrl);
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <Ionicons name="copy-outline" size={20} color={colors.primary} />
                <Text style={[styles.modalButtonText, styles.copyButtonText]}>Copy URL</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalNote}>
              After completing payment, return to the app and your subscription will be activated.
            </Text>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 22,
  },
  urlContainer: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  urlInput: {
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  openButton: {
    backgroundColor: colors.primary,
  },
  copyButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  copyButtonText: {
    color: colors.primary,
  },
  modalNote: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

