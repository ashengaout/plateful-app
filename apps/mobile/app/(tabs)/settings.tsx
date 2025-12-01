import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@plateful/ui';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from '../../src/services/auth';
import { auth } from '../../src/config/firebase';
import { checkSubscriptionStatus, cancelSubscription } from '../../src/services/payments';
import { colors } from '@plateful/shared';

export default function Settings() {
  const router = useRouter();
  const user = auth.currentUser;
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    isPremium: boolean;
    subscriptionStatus: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    if (user) {
      loadSubscriptionStatus();
    }
  }, [user]);

  const loadSubscriptionStatus = async () => {
    if (!user) return;
    try {
      setLoadingStatus(true);
      const status = await checkSubscriptionStatus(user.uid);
      setSubscriptionStatus(status);
    } catch (error) {
      console.error('Failed to load subscription status:', error);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your premium subscription? You will instantly lose access to all premium features, including custom preferences and personalized recipe recommendations.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setCanceling(true);
              await cancelSubscription(user.uid);
              Alert.alert('Subscription Canceled', 'Your subscription has been canceled. Premium features are no longer available.');
              await loadSubscriptionStatus();
            } catch (error) {
              console.error('Error canceling subscription:', error);
              const errorMessage = error instanceof Error ? error.message : 'Failed to cancel subscription';
              Alert.alert('Error', errorMessage);
            } finally {
              setCanceling(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/sign-in');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const isPremium = subscriptionStatus?.isPremium || false;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{auth.currentUser?.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>User ID</Text>
          <Text style={styles.value}>{auth.currentUser?.uid}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        {loadingStatus ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading subscription status...</Text>
          </View>
        ) : (
          <>
            <View style={[styles.infoRow, styles.lastInfoRow]}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusContainer}>
                {isPremium ? (
                  <>
                    <View style={styles.premiumBadge}>
                      <Ionicons name="star" size={18} color={colors.primary} />
                      <Text style={[styles.value, styles.premiumText]}>Premium Active</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
                    <Text style={styles.value}>Free</Text>
                  </>
                )}
              </View>
            </View>
            {isPremium && subscriptionStatus?.subscriptionCurrentPeriodEnd && (
              <View style={[styles.infoRow, styles.lastInfoRow]}>
                <Text style={styles.label}>Renews on</Text>
                <Text style={styles.value}>
                  {new Date(subscriptionStatus.subscriptionCurrentPeriodEnd).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            )}
            {isPremium && (
              <View style={styles.warningBox}>
                <Ionicons name="warning" size={20} color="#FF6B35" style={styles.warningIcon} />
                <Text style={styles.warningText}>
                  If you cancel, you will instantly lose access to all premium features.
                </Text>
              </View>
            )}
            {isPremium && (
              <View style={styles.buttonContainer}>
                <Button
                  title={canceling ? "Canceling..." : "Cancel Subscription"}
                  onPress={handleCancelSubscription}
                  variant="outline"
                  disabled={canceling}
                />
              </View>
            )}
            {!isPremium && (
              <View style={styles.buttonContainer}>
                <Button
                  title="Upgrade to Premium"
                  onPress={() => router.push('/(tabs)/upgrade')}
                  variant="primary"
                />
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Info</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Platform</Text>
          <Text style={styles.value}>React Native + Expo</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="outline"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  section: {
    padding: 20,
    marginTop: 12,
    marginHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  infoRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastInfoRow: {
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    justifyContent: 'center',
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: colors.textSecondary,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  premiumText: {
    color: colors.primary,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF4E6',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B35',
  },
  warningIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#8B4513',
    lineHeight: 18,
    fontWeight: '500',
  },
  buttonContainer: {
    marginTop: 12,
  },
});
