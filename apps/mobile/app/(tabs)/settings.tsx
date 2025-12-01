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
      'Are you sure you want to cancel your premium subscription? You will lose access to all premium features at the end of your current billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setCanceling(true);
              await cancelSubscription(user.uid);
              Alert.alert('Success', 'Your subscription has been canceled. You will retain access until the end of your current billing period.');
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
            <View style={styles.infoRow}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusContainer}>
                {isPremium ? (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    <Text style={[styles.value, styles.premiumText]}>Premium Active</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                    <Text style={styles.value}>Free</Text>
                  </>
                )}
              </View>
            </View>
            {isPremium && subscriptionStatus?.subscriptionCurrentPeriodEnd && (
              <View style={styles.infoRow}>
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
              <View style={styles.section}>
                <Button
                  title={canceling ? "Canceling..." : "Cancel Subscription"}
                  onPress={handleCancelSubscription}
                  variant="outline"
                  disabled={canceling}
                />
              </View>
            )}
            {!isPremium && (
              <View style={styles.section}>
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
    backgroundColor: '#f5f5f5',
  },
  section: {
    padding: 24,
    marginTop: 16,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  premiumText: {
    color: colors.primary,
    fontWeight: '600',
  },
});
