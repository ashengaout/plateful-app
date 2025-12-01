import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@plateful/shared';

interface PremiumLockProps {
  featureName?: string;
  message?: string;
}

export default function PremiumLock({ 
  featureName = 'this feature',
  message 
}: PremiumLockProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    router.push('/(tabs)/upgrade');
  };

  return (
    <View style={styles.container}>
      <View style={styles.lockIconContainer}>
        <Ionicons name="lock-closed" size={48} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>Premium Feature</Text>
      <Text style={styles.message}>
        {message || `Unlock ${featureName} with a premium subscription`}
      </Text>
      <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
        <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.surface} style={styles.arrowIcon} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 16,
  },
  lockIconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  arrowIcon: {
    marginLeft: 8,
  },
});

