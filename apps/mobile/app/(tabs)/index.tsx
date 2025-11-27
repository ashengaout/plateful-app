import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Animated, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, semanticColors } from '../../theme/colors';
import { getCurrentUser, onAuthStateChange } from '../../src/services/auth';
import Header from '../../src/components/Header';
import { auth } from '../../src/config/firebase';
import type { FoodProfile, DailyNutritionTotals } from '@plateful/shared';
import { aggregateDailyNutrition, calculatePercentage, formatNutritionValue } from '../../src/utils/nutrition';
import { dailyTips } from '../../src/constants/dailyTips';
import { API_BASE } from '../../src/config/api';

interface DayInfo {
  date: Date;
  dayOfMonth: number;
  dayName: string;
  completed: boolean;
}

// Daily Tip Card Component
function DailyTipCard() {
  // Get today's day of month (1-31)
  const dayOfMonth = new Date().getDate();
  const tip = dailyTips[dayOfMonth - 1] || dailyTips[0]; // Use day as index (0-indexed)

  return (
    <View style={styles.tipCard}>
      <View style={styles.tipHeader}>
        <Ionicons name="bulb" size={24} color={colors.primary} style={styles.tipIcon} />
        <Text style={styles.tipTitle}>Daily Tip</Text>
      </View>
      <Text style={styles.tipText}>{tip}</Text>
    </View>
  );
}

// Streak Day Component with Gold Sparkles
function StreakDay({ dayInfo, dayIndex }: { dayInfo: DayInfo; dayIndex: number }) {
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!dayInfo.completed) return;

    const createSparkleAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.delay(1000),
        ])
      );
    };

    const anim1 = createSparkleAnimation(sparkle1, dayIndex * 100);
    const anim2 = createSparkleAnimation(sparkle2, dayIndex * 100 + 150);
    const anim3 = createSparkleAnimation(sparkle3, dayIndex * 100 + 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dayInfo.completed, dayIndex]);

  return (
    <View style={styles.dayContainer}>
      <Text style={styles.dayNameLabel}>{dayInfo.dayName}</Text>
      <View
        style={[
          styles.dayCircle,
          dayInfo.completed ? styles.dayCircleCompleted : styles.dayCircleIncomplete,
        ]}
      >
        {dayInfo.completed ? (
          <>
            <Text style={styles.dayNumberCompleted}>{dayInfo.dayOfMonth}</Text>
            <View style={styles.streakSparkleContainer}>
              <Animated.View
                style={[
                  styles.streakSparkleDot,
                  styles.streakSparkle1,
                  {
                    opacity: sparkle1,
                    transform: [{
                      scale: sparkle1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1.3],
                      }),
                    }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.streakSparkleDot,
                  styles.streakSparkle2,
                  {
                    opacity: sparkle2,
                    transform: [{
                      scale: sparkle2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1.3],
                      }),
                    }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.streakSparkleDot,
                  styles.streakSparkle3,
                  {
                    opacity: sparkle3,
                    transform: [{
                      scale: sparkle3.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1.3],
                      }),
                    }],
                  },
                ]}
              />
            </View>
          </>
        ) : (
          <Text style={styles.dayNumber}>{dayInfo.dayOfMonth}</Text>
        )}
      </View>
    </View>
  );
}

export default function Dashboard() {
  const [userName, setUserName] = useState('Name');
  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState<DayInfo[]>([]);
  const [dayStreak, setDayStreak] = useState(0);
  const [userTimezone, setUserTimezone] = useState<string>('America/New_York'); // Default to Eastern Time
  const [userProfile, setUserProfile] = useState<FoodProfile | null>(null);
  const [weeklyNutrition, setWeeklyNutrition] = useState<{ date: string; totals: DailyNutritionTotals; dayName: string }[]>([]);
  const [todayNutrition, setTodayNutrition] = useState<DailyNutritionTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async (): Promise<void> => {
    if (!auth.currentUser) return;

    try {
      console.log('🔍 Testing API connectivity to:', `${API_BASE}/api/health`);
      
      // First test basic connectivity with health endpoint
      const healthResponse = await fetch(`${API_BASE}/api/health`);
      console.log('🏥 Health check response status:', healthResponse.status);
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('🏥 Health check data:', healthData);
      }
      
      console.log('👤 Attempting to load profile from:', `${API_BASE}/api/profile/${auth.currentUser.uid}`);
      const response = await fetch(`${API_BASE}/api/profile/${auth.currentUser.uid}`);
      if (response.ok) {
        const data = await response.json();
        const profile = data.profile as FoodProfile;
        setUserProfile(profile);
        if (profile?.displayName) {
          setUserName(profile.displayName);
        }
        // Load timezone from profile, default to Eastern Time
        if (profile?.timezone) {
          setUserTimezone(profile.timezone);
        } else {
          setUserTimezone('America/New_York');
        }
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }

    // Fallback to Firebase Auth if not in profile
    const currentUser = getCurrentUser();
    if (currentUser?.displayName) {
      setUserName(currentUser.displayName);
    } else {
      setUserName('Name');
    }
    setUserTimezone('America/New_York'); // Default fallback
    setLoading(false);
  }, []);

  const updateUserName = useCallback(() => {
    // Try to get from profile first
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    // Get current user immediately
    updateUserName();

    // Listen for auth state changes
    const unsubscribe = onAuthStateChange((user) => {
      if (user?.displayName) {
        setUserName(user.displayName);
      } else {
        setUserName('Name'); // Fallback if no display name
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [updateUserName]);

  // Helper function to get date string in user's timezone
  const getDateStringInTimezone = (date: Date, timezone: string): string => {
    // Use Intl.DateTimeFormat to format date in the user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  };

  // Helper function to get today's date in user's timezone
  const getTodayInTimezone = (timezone: string): Date => {
    const now = new Date();
    // Get current date components in the user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1; // 0-indexed
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    // Create date object in local time but with values from timezone
    return new Date(year, month, day, 0, 0, 0, 0);
  };

  const loadStreakData = useCallback(async () => {
    if (!auth.currentUser) return;

    try {
      // Fetch both recipes and tracked meals to calculate streak
      const today = getTodayInTimezone(userTimezone);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 365); // Last year for streak calculation
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7); // Next week to catch any future dates
      
      const startDateStr = getDateStringInTimezone(startDate, userTimezone);
      const endDateStr = getDateStringInTimezone(endDate, userTimezone);

      const [recipesResponse, mealsResponse] = await Promise.all([
        fetch(`${API_BASE}/api/generate-recipe/user/${auth.currentUser.uid}`).catch(() => null),
        fetch(`${API_BASE}/api/meal-tracking/user/${auth.currentUser.uid}/range?startDate=${startDateStr}&endDate=${endDateStr}`).catch(() => null),
      ]);

      // Handle 503 (service unavailable - Cosmos DB not configured) gracefully
      let recipes: any[] = [];
      if (recipesResponse && recipesResponse.ok) {
        const recipesData = await recipesResponse.json();
        recipes = recipesData.recipes || [];
      } else if (recipesResponse && recipesResponse.status === 503) {
        // Cosmos DB not configured - treat as empty data
        console.log('Recipe service not available (Cosmos DB not configured)');
        recipes = [];
      } else if (recipesResponse && !recipesResponse.ok) {
        // Other errors - log but don't throw
        console.warn('Failed to load recipes:', recipesResponse.status, recipesResponse.statusText);
        recipes = [];
      }

      // Group recipes by date (YYYY-MM-DD) in user's timezone
      const activityByDate = new Set<string>();
      recipes.forEach((recipe: any) => {
        if (recipe.createdAt) {
          const date = new Date(recipe.createdAt);
          const dateStr = getDateStringInTimezone(date, userTimezone);
          activityByDate.add(dateStr);
        }
      });

      // Also include tracked meals in the activity
      if (mealsResponse && mealsResponse.ok) {
        const mealsData = await mealsResponse.json();
        const dailyData = mealsData.dailyData || {};
        
        // Add all dates that have tracked meals
        Object.keys(dailyData).forEach((dateStr) => {
          const dayData = dailyData[dateStr];
          if (dayData.meals && dayData.meals.length > 0) {
            activityByDate.add(dateStr);
          }
        });
      }

      // Generate last 7 days with actual calendar dates in user's timezone
      const days: DayInfo[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const dateStr = getDateStringInTimezone(date, userTimezone);
        const dayName = date.toLocaleDateString('en-US', { 
          weekday: 'short',
          timeZone: userTimezone,
        });
        const dayOfMonth = parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            day: 'numeric',
          }).format(date)
        );
        
        days.push({
          date,
          dayOfMonth,
          dayName,
          completed: activityByDate.has(dateStr),
        });
      }

      setStreakDays(days);

      // Calculate streak (consecutive days from today backwards) in user's timezone
      let streak = 0;
      const todayStr = getDateStringInTimezone(today, userTimezone);
      
      // If today has activity, start counting from today
      // Otherwise start from yesterday
      let checkDate = new Date(today);
      if (!activityByDate.has(todayStr)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (streak < 365) { // Cap at 365 days
        const checkDateStr = getDateStringInTimezone(checkDate, userTimezone);
        if (activityByDate.has(checkDateStr)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      setDayStreak(streak);
    } catch (error) {
      console.error('Failed to load streak data:', error);
      // Set default empty streak on error
      const today = getTodayInTimezone(userTimezone);
      const days: DayInfo[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayOfMonth = parseInt(
          new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            day: 'numeric',
          }).format(date)
        );
        days.push({
          date,
          dayOfMonth,
          dayName: date.toLocaleDateString('en-US', { 
            weekday: 'short',
            timeZone: userTimezone,
          }),
          completed: false,
        });
      }
      setStreakDays(days);
      setDayStreak(0);
    }
  }, [userTimezone]);

  // Load weekly nutrition data
  const loadWeeklyNutrition = useCallback(async (showRefreshing = false) => {
    if (!auth.currentUser || !userTimezone) return;

    if (showRefreshing) {
      setRefreshing(true);
    }

    try {
      // Get last 7 days date range
      const today = getTodayInTimezone(userTimezone);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 6);
      
      const startDateStr = getDateStringInTimezone(startDate, userTimezone);
      const endDateStr = getDateStringInTimezone(today, userTimezone);

      const response = await fetch(
        `${API_BASE}/api/meal-tracking/user/${auth.currentUser.uid}/range?startDate=${startDateStr}&endDate=${endDateStr}`
      );

      if (response.ok) {
        const data = await response.json();
        const dailyData = data.dailyData || {};

        // Log for debugging
        console.log('[loadWeeklyNutrition] Received dailyData:', Object.keys(dailyData));
        Object.entries(dailyData).forEach(([date, dayData]: [string, any]) => {
          console.log(`[loadWeeklyNutrition] ${date}:`, {
            mealCount: dayData.meals?.length || 0,
            totals: dayData.totals,
            meals: dayData.meals?.map((m: any) => ({
              id: m.id,
              recipeID: m.recipeID,
              portions: m.portions,
              calories: m.nutrition?.calories,
            })) || [],
          });
        });

        // Generate last 7 days with nutrition data
        const days: { date: string; totals: DailyNutritionTotals; dayName: string }[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = getDateStringInTimezone(date, userTimezone);
          const dayName = date.toLocaleDateString('en-US', {
            weekday: 'short',
            timeZone: userTimezone,
          });

          days.push({
            date: dateStr,
            totals: dailyData[dateStr]?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 },
            dayName,
          });
        }

        setWeeklyNutrition(days);
        
        // Set today's nutrition
        const todayStr = getDateStringInTimezone(today, userTimezone);
        setTodayNutrition(dailyData[todayStr]?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
    } catch (error) {
      console.error('Failed to load weekly nutrition:', error);
      // Set empty data on error
      const days: { date: string; totals: DailyNutritionTotals; dayName: string }[] = [];
      const today = getTodayInTimezone(userTimezone);
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = getDateStringInTimezone(date, userTimezone);
        const dayName = date.toLocaleDateString('en-US', {
          weekday: 'short',
          timeZone: userTimezone,
        });
        days.push({
          date: dateStr,
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
          dayName,
        });
      }
      setWeeklyNutrition(days);
      setTodayNutrition({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    } finally {
      if (showRefreshing) {
        setRefreshing(false);
      }
    }
  }, [userTimezone]);

  // Update display name, timezone, and streak when screen comes into focus (e.g., after updating in profile)
  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Screen focused, refreshing data...');
      // Load profile first (which sets timezone), then load streak data and nutrition
      loadProfile().then(() => {
        loadStreakData();
        loadWeeklyNutrition();
      }).catch(() => {
        // Even if profile load fails, try to load streak with default timezone
        loadStreakData();
        loadWeeklyNutrition();
      });
    }, [loadProfile, loadStreakData, loadWeeklyNutrition])
  );

  const onRefresh = useCallback(() => {
    loadProfile().then(() => {
      loadStreakData();
      loadWeeklyNutrition(true);
    }).catch(() => {
      loadStreakData();
      loadWeeklyNutrition(true);
    });
  }, [loadProfile, loadStreakData, loadWeeklyNutrition]);

  useEffect(() => {
    if (auth.currentUser) {
      // Load profile first (which sets timezone), then load streak data and nutrition
      loadProfile().then(() => {
        loadStreakData();
        loadWeeklyNutrition();
      }).catch(() => {
        // Even if profile load fails, try to load streak with default timezone
        loadStreakData();
        loadWeeklyNutrition();
      });
    }
  }, [loadProfile, loadStreakData, loadWeeklyNutrition]);

  // Calculate max calories for chart (target or highest value)
  const maxCalories = userProfile?.dailyMacroTargets?.calories 
    ? Math.max(userProfile.dailyMacroTargets.calories, ...weeklyNutrition.map(d => d.totals.calories))
    : Math.max(2000, ...weeklyNutrition.map(d => d.totals.calories), 1);

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Header showLogo={true} />
      
      {/* Combined Welcome & Streak Card */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeStreakContainer}>
          <Text style={styles.greeting}>Hi, {userName}</Text>
          <View style={styles.streakSection}>
            <Text style={styles.streakText}>{dayStreak} {dayStreak === 1 ? 'day' : 'days'} streak</Text>
            <View style={styles.daysContainer}>
              {streakDays.map((dayInfo, index) => (
                <StreakDay
                  key={index}
                  dayInfo={dayInfo}
                  dayIndex={index}
                />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Daily Tip */}
      <DailyTipCard />

      {/* Today's Progress */}
      {userProfile?.dailyMacroTargets && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📊</Text>
            <Text style={styles.sectionTitle}>Today's Progress</Text>
          </View>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Calories</Text>
              <Text style={styles.progressValue}>
                {Math.round(todayNutrition.calories)} / {userProfile.dailyMacroTargets.calories || 0}
              </Text>
              {(() => {
                const percentage = calculatePercentage(todayNutrition.calories, userProfile.dailyMacroTargets.calories);
                return percentage !== null && (
                  <Text style={styles.progressPercentage}>{percentage}%</Text>
                );
              })()}
            </View>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Protein</Text>
              <Text style={styles.progressValue}>
                {Math.round(todayNutrition.protein)}g / {userProfile.dailyMacroTargets.protein || 0}g
              </Text>
              {(() => {
                const percentage = calculatePercentage(todayNutrition.protein, userProfile.dailyMacroTargets.protein);
                return percentage !== null && (
                  <Text style={styles.progressPercentage}>{percentage}%</Text>
                );
              })()}
            </View>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Carbs</Text>
              <Text style={styles.progressValue}>
                {Math.round(todayNutrition.carbs)}g / {userProfile.dailyMacroTargets.carbs || 0}g
              </Text>
              {(() => {
                const percentage = calculatePercentage(todayNutrition.carbs, userProfile.dailyMacroTargets.carbs);
                return percentage !== null && (
                  <Text style={styles.progressPercentage}>{percentage}%</Text>
                );
              })()}
            </View>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Fat</Text>
              <Text style={styles.progressValue}>
                {Math.round(todayNutrition.fat)}g / {userProfile.dailyMacroTargets.fat || 0}g
              </Text>
              {(() => {
                const percentage = calculatePercentage(todayNutrition.fat, userProfile.dailyMacroTargets.fat);
                return percentage !== null && (
                  <Text style={styles.progressPercentage}>{percentage}%</Text>
                );
              })()}
            </View>
          </View>
        </View>
      )}

      {/* Daily Calories */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar" size={20} color={colors.textPrimary} style={styles.sectionIcon} />
          <Text style={styles.sectionTitle}>Daily Calories (Last 7 Days)</Text>
        </View>

        <View style={styles.chartContainer}>
          <View style={styles.chart}>
            {weeklyNutrition.map((dayData, index) => {
              const percentage = (dayData.totals.calories / maxCalories) * 100;
              const isToday = dayData.date === getDateStringInTimezone(getTodayInTimezone(userTimezone), userTimezone);
              return (
                <View key={index} style={styles.barContainer}>
                  <View style={styles.barWrapper}>
                    {userProfile?.dailyMacroTargets?.calories && (
                      <View
                        style={[
                          styles.targetLine,
                          {
                            bottom: `${(userProfile.dailyMacroTargets.calories / maxCalories) * 100}%`,
                          },
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.min(percentage, 100)}%`,
                          backgroundColor: isToday ? colors.primary : colors.secondary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barValue}>{Math.round(dayData.totals.calories)}</Text>
                  <Text style={styles.barLabel}>{dayData.dayName}</Text>
                </View>
              );
            })}
          </View>
          {userProfile?.dailyMacroTargets?.calories && (
            <Text style={styles.targetLabel}>
              Target: {userProfile.dailyMacroTargets.calories} kcal
            </Text>
          )}
        </View>
      </View>

      {/* Daily Macro Distribution */}
      {userProfile?.dailyMacroTargets && (
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart" size={20} color={colors.textPrimary} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Today's Macro Distribution</Text>
          </View>

          <View style={styles.macroContainer}>
            {/* Protein */}
            <View style={styles.macroItem}>
              <View style={styles.macroHeader}>
                <View style={styles.macroLabelContainer}>
                  <View style={[styles.macroColorIndicator, { backgroundColor: semanticColors.protein }]} />
                  <Text style={styles.macroLabelBold}>Protein</Text>
                </View>
                <View style={styles.macroValueContainer}>
                  <Text style={styles.macroCurrentValue}>{Math.round(todayNutrition.protein)}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                  <Text style={styles.macroSeparator}> / </Text>
                  <Text style={styles.macroTargetValue}>{userProfile.dailyMacroTargets.protein}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar,
                    { 
                      backgroundColor: semanticColors.protein,
                      width: `${Math.min((todayNutrition.protein / userProfile.dailyMacroTargets.protein) * 100, 100)}%`,
                    }
                  ]} 
                />
              </View>
              <Text style={styles.macroPercentage}>
                {calculatePercentage(todayNutrition.protein, userProfile.dailyMacroTargets.protein) || '0'}%
              </Text>
            </View>

            {/* Carbs */}
            <View style={styles.macroItem}>
              <View style={styles.macroHeader}>
                <View style={styles.macroLabelContainer}>
                  <View style={[styles.macroColorIndicator, { backgroundColor: semanticColors.carbs }]} />
                  <Text style={styles.macroLabelBold}>Carbs</Text>
                </View>
                <View style={styles.macroValueContainer}>
                  <Text style={styles.macroCurrentValue}>{Math.round(todayNutrition.carbs)}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                  <Text style={styles.macroSeparator}> / </Text>
                  <Text style={styles.macroTargetValue}>{userProfile.dailyMacroTargets.carbs}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar,
                    { 
                      backgroundColor: semanticColors.carbs,
                      width: `${Math.min((todayNutrition.carbs / userProfile.dailyMacroTargets.carbs) * 100, 100)}%`,
                    }
                  ]} 
                />
              </View>
              <Text style={styles.macroPercentage}>
                {calculatePercentage(todayNutrition.carbs, userProfile.dailyMacroTargets.carbs) || '0'}%
              </Text>
            </View>

            {/* Fat */}
            <View style={styles.macroItem}>
              <View style={styles.macroHeader}>
                <View style={styles.macroLabelContainer}>
                  <View style={[styles.macroColorIndicator, { backgroundColor: semanticColors.fat }]} />
                  <Text style={styles.macroLabelBold}>Fat</Text>
                </View>
                <View style={styles.macroValueContainer}>
                  <Text style={styles.macroCurrentValue}>{Math.round(todayNutrition.fat)}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                  <Text style={styles.macroSeparator}> / </Text>
                  <Text style={styles.macroTargetValue}>{userProfile.dailyMacroTargets.fat}</Text>
                  <Text style={styles.macroUnit}>g</Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View 
                  style={[
                    styles.progressBar,
                    { 
                      backgroundColor: semanticColors.fat,
                      width: `${Math.min((todayNutrition.fat / userProfile.dailyMacroTargets.fat) * 100, 100)}%`,
                    }
                  ]} 
                />
              </View>
              <Text style={styles.macroPercentage}>
                {calculatePercentage(todayNutrition.fat, userProfile.dailyMacroTargets.fat) || '0'}%
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  welcomeCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeStreakContainer: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  streakSection: {
    marginTop: 0,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 14,
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  dayContainer: {
    alignItems: 'center',
    flex: 1,
  },
  dayNameLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    position: 'relative',
    overflow: 'visible',
  },
  dayCircleCompleted: {
    backgroundColor: '#FFD700', // Gold like the button - flat color
    borderWidth: 0,
    overflow: 'visible',
    // Shadow for the whole circle
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  dayCircleIncomplete: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  streakSparkleContainer: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streakSparkleDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: 'rgba(255, 215, 0, 1)', // Gold sparkle
    borderRadius: 2,
  },
  streakSparkle1: {
    top: '10%',
    left: '15%',
  },
  streakSparkle2: {
    top: '20%',
    right: '15%',
  },
  streakSparkle3: {
    bottom: '15%',
    left: '50%',
  },
  dayNumber: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  dayNumberCompleted: {
    color: '#1a1a1a', // Dark text like gold button
    fontSize: 16,
    fontWeight: '700',
    zIndex: 1,
  },
  tipCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 18,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(115, 217, 193, 0.2)', // colors.primary with 20% opacity
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipIcon: {
    marginRight: 8,
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tipText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chartContainer: {
    marginTop: 10,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 200,
    paddingTop: 20,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  barWrapper: {
    width: '70%',
    height: 160,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  barLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  macroContainer: {
    gap: 20,
    marginTop: 8,
  },
  macroItem: {
    marginBottom: 16,
  },
  macroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  macroLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  macroLabelBold: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  macroValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroCurrentValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  macroTargetValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  macroUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  macroSeparator: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
    minWidth: 2,
  },
  macroPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  donutChart: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  donutInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.surface,
  },
  legend: {
    flex: 1,
    paddingLeft: 20,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  // Progress styles
  progressContainer: {
    gap: 12,
    marginTop: 8,
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    flex: 1,
  },
  progressValue: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: 8,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    minWidth: 50,
    textAlign: 'right',
  },
  // Target line for chart
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.edited,
    zIndex: 1,
  },
  targetLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
