import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Platform,
  Image,
  Alert,
  Animated,
  Modal,
  FlatList,
  TextInput,
  LayoutAnimation,
  UIManager,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Recipe, GroceryList, PantryItem, FoodProfile, ScalingWarning, MealTracking } from '@plateful/shared';
import { colors, semanticColors, parseIngredients, findPantryMatch, extractPortionNumber, scaleIngredient, scaleNutrition, detectCookingConstraints, checkScalingConstraints } from '@plateful/shared';
import { auth } from '../../src/config/firebase';
import Header from '../../src/components/Header';
import PortionSelector from '../../src/components/PortionSelector';
import ScalingWarningsModal from '../../src/components/ScalingWarningsModal';
import SubstitutionBanner from '../../src/components/SubstitutionBanner';
import { useRouter } from 'expo-router';
import { API_BASE } from '../../src/config/api';

interface IngredientItem {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  notes?: string;
  checked: boolean; // User approval
  pantryMatch?: {
    item: PantryItem | null;
    matchType: 'exact' | 'fuzzy' | null;
  };
}

interface AddToGroceryModalProps {
  visible: boolean;
  recipe: Recipe | null;
  currentPortionSize?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}


function AddToGroceryModal({ visible, recipe, currentPortionSize, onClose, onSuccess }: AddToGroceryModalProps) {

  const [lists, setLists] = useState<GroceryList[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [selectedListID, setSelectedListID] = useState<string | null>(null);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);
  const [parsingIngredients, setParsingIngredients] = useState(false);

  useEffect(() => {
    if (visible && recipe && auth.currentUser) {
      loadLists();
      loadPantryItems();
    }
  }, [visible, recipe]);

  useEffect(() => {
    if (visible && recipe && pantryItems.length >= 0) {
      parseRecipeIngredients();
    }
  }, [visible, recipe, pantryItems, currentPortionSize]);

  const loadLists = async () => {
    if (!auth.currentUser) return;

    try {
      setLoadingLists(true);
      const response = await fetch(`${API_BASE}/api/grocery/${auth.currentUser.uid}/lists`);
      
      if (!response.ok) {
        throw new Error('Failed to load grocery lists');
      }

      const data = await response.json();
      setLists(data.lists || []);
    } catch (error) {
      console.error('Failed to load grocery lists:', error);
      Alert.alert('Error', 'Failed to load grocery lists');
    } finally {
      setLoadingLists(false);
    }
  };

  const loadPantryItems = async () => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/pantry/${auth.currentUser.uid}`);
      
      if (!response.ok) {
        throw new Error('Failed to load pantry items');
      }

      const data = await response.json();
      setPantryItems(data.items || []);
    } catch (error) {
      console.error('Failed to load pantry items:', error);
    }
  };

  const parseRecipeIngredients = async () => {
    if (!recipe) return;

    // Scale ingredients if portion size is different from original
    const originalPortions = extractPortionNumber(recipe.recipeData.portions);
    // Use currentPortionSize if provided, otherwise use recipe's userPortionSize, or fall back to original
    const targetPortions = currentPortionSize ?? recipe.userPortionSize ?? originalPortions;
    const shouldScale = targetPortions !== originalPortions;

    // Scale ingredients before parsing
    let ingredientsToParse = shouldScale
      ? recipe.recipeData.ingredients.map(ing => {
          const scaled = scaleIngredient(ing, originalPortions, targetPortions);
          return scaled;
        })
      : recipe.recipeData.ingredients;

    // Filter out obviously malformed ingredients (preparation words, empty strings, etc.)
    const preparationWords = new Set([
      'boiling', 'sliced', 'minced', 'chopped', 'diced', 'grated', 'crushed', 
      'ground', 'whole', 'pieces', 'cubed', 'julienned', 'shredded', 'pureed',
      'mashed', 'whipped', 'beaten', 'separated', 'strained', 'drained',
      'peeled', 'seeded', 'stemmed', 'trimmed', 'cleaned', 'washed'
    ]);
    
    ingredientsToParse = ingredientsToParse.filter((ing, index) => {
      if (!ing || typeof ing !== 'string') return false;
      const trimmed = ing.trim();
      if (!trimmed || trimmed.length < 2) return false;
      
      const lower = trimmed.toLowerCase();
      
      // Filter out ingredients that are just preparation words
      if (preparationWords.has(lower)) {
        // Special case: if "boiling" has a unit (like "cups"), it might be "boiling water"
        // Try to merge with previous ingredient or fix it
        const hasUnit = /\b(cups?|tbsp|tsp|oz|lb|g|kg|ml|l)\b/i.test(trimmed);
        if (hasUnit && index > 0) {
          // This might be a fragment - check if previous ingredient could be merged
          const prevIng = ingredientsToParse[index - 1];
          if (prevIng && typeof prevIng === 'string') {
            // If previous ingredient ends with a number/unit, this might be a continuation
            // For now, we'll filter it out and let the AI parser handle it
            console.warn(`⚠️ Detected likely incomplete ingredient: "${trimmed}" (index ${index})`);
          }
        }
        return false;
      }
      
      // Filter out ingredients that are just numbers or fractions
      if (/^[\d\s\/\-\.]+$/.test(trimmed)) return false;
      
      // Filter out ingredients that are just punctuation or special characters
      if (/^[^\w\s]+$/.test(trimmed)) return false;
      
      // Detect incomplete ingredients: preparation word + unit but no ingredient name
      // Pattern: "quantity unit preparation" without a noun (e.g., "2 cups boiling")
      const hasQuantityAndUnit = /^\d+[\s\/\-\.]*\d*\s*(cups?|tbsp|tsp|oz|lb|g|kg|ml|l|pieces?|cloves?)\s+[a-z]+$/i.test(trimmed);
      if (hasQuantityAndUnit) {
        const words = trimmed.split(/\s+/);
        const lastWord = words[words.length - 1]?.toLowerCase();
        if (lastWord && preparationWords.has(lastWord)) {
          // This is likely incomplete (e.g., "2 cups boiling" should be "2 cups boiling water")
          console.warn(`⚠️ Detected likely incomplete ingredient: "${trimmed}" - missing ingredient name`);
          // Don't filter it out - let AI parser try to fix it
        }
      }
      
      return true;
    });

    // Log raw ingredients to debug parsing issues
    console.log('📋 Raw ingredients from recipe:', recipe.recipeData.ingredients);
    console.log('📋 Ingredients to parse (after scaling and filtering):', ingredientsToParse);

    setParsingIngredients(true);

    try {
      // Try AI parser first
      console.log('🧠 Calling AI ingredient parser with', ingredientsToParse.length, 'ingredients');
      const response = await fetch(`${API_BASE}/api/parse-ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ingredientsToParse }),
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = data.parsed || [];
        
        if (!parsed || parsed.length === 0) {
          throw new Error('AI parser returned empty results');
        }

        console.log('✅ AI parser succeeded, parsed', parsed.length, 'ingredients');
        
        const ingredientItems: IngredientItem[] = parsed.map((item: any) => {
          const pantryMatch = findPantryMatch(item.name, pantryItems);
          return {
            ...item,
            checked: pantryMatch.matchType === 'exact' ? true : true, // Default all checked, exact matches auto-checked
            pantryMatch,
          };
        });

        setIngredients(ingredientItems);
        setParsingIngredients(false);
        return;
      } else {
        // Try to get error details from response
        let errorMessage = `AI parser failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
            if (errorData.details) {
              errorMessage += ` - ${errorData.details}`;
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          console.warn('Could not parse error response:', parseError);
        }
        console.error('❌ AI parser failed with status', response.status, errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('❌ AI parser error:', error);
      
      // Show error to user instead of silently falling back to bad parser
      Alert.alert(
        'Parsing Error',
        `Failed to parse ingredients with AI: ${error.message || 'Unknown error'}\n\nPlease try again or contact support if the issue persists.`,
        [{ text: 'OK' }]
      );
      
      // Still try local parser as last resort, but warn user
      console.warn('⚠️ Falling back to local parser (may produce poor results)');
      const parsed = parseIngredients(ingredientsToParse);
      
      // Filter out obviously bad results (ingredients that are just preparation words)
      const preparationWords = new Set(['boiling', 'sliced', 'minced', 'chopped', 'diced', 'grated', 'crushed', 'ground', 'whole', 'pieces']);
      const filtered = parsed.filter(item => {
        const nameLower = item.name.toLowerCase().trim();
        return nameLower.length > 2 && !preparationWords.has(nameLower);
      });
      
      if (filtered.length === 0) {
        // If filtering removed everything, use original but warn
        console.warn('⚠️ All ingredients filtered out, using original parse results');
      }
      
      const ingredientItems: IngredientItem[] = (filtered.length > 0 ? filtered : parsed).map(item => {
        const pantryMatch = findPantryMatch(item.name, pantryItems);
        return {
          ...item,
          checked: pantryMatch.matchType === 'exact' ? true : true,
          pantryMatch,
        };
      });

      setIngredients(ingredientItems);
    } finally {
      setParsingIngredients(false);
    }
  };

  const toggleIngredient = (index: number) => {
    setIngredients(prev => 
      prev.map((item, i) => 
        i === index ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const createListAndAdd = async () => {
    if (!auth.currentUser || !newListName.trim()) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/grocery/${auth.currentUser.uid}/lists`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newListName.trim() }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create list');
      }

      const data = await response.json();
      await loadLists();
      setSelectedListID(data.list.id);
      setShowCreateList(false);
      setNewListName('');
    } catch (error) {
      console.error('Failed to create list:', error);
      Alert.alert('Error', 'Failed to create list');
    }
  };

  const handleAddToGroceryList = async () => {
    if (!auth.currentUser || !selectedListID) {
      Alert.alert('Select List', 'Please select a grocery list');
      return;
    }

    const selectedIngredients = ingredients.filter(ing => ing.checked);
    if (selectedIngredients.length === 0) {
      Alert.alert('No Items', 'Please select at least one ingredient to add');
      return;
    }

    setLoading(true);
    try {
      const itemsToAdd = selectedIngredients.map(ing => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
        notes: ing.notes,
      }));

      const response = await fetch(
        `${API_BASE}/api/grocery/${auth.currentUser.uid}/lists/${selectedListID}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemsToAdd }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add items');
      }

      const data = await response.json();
      const createdItems = data.items || [];
      
      // Mark exact pantry matches as completed (crossed out)
      const exactMatches = selectedIngredients.filter(
        ing => ing.pantryMatch?.matchType === 'exact'
      );

      if (exactMatches.length > 0) {
        // Update exact matches to completed
        for (const item of createdItems) {
          const ingredient = selectedIngredients.find(
            ing => ing.name.toLowerCase() === item.name.toLowerCase()
          );
          if (ingredient?.pantryMatch?.matchType === 'exact') {
            await fetch(
              `${API_BASE}/api/grocery/${auth.currentUser.uid}/lists/${selectedListID}/items/${item.id}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
              }
            ).catch(err => console.error('Failed to mark item completed:', err));
          }
        }
      }

      Alert.alert('Success', `Added ${selectedIngredients.length} item(s) to your grocery list`);
      onClose();
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Failed to add items:', error);
      Alert.alert('Error', error.message || 'Failed to add items to grocery list');
    } finally {
      setLoading(false);
    }
  };

  if (!recipe) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={addGroceryStyles.modalBackdrop}>
        <View style={addGroceryStyles.modalContent}>
          <View style={addGroceryStyles.modalHeader}>
            <Text style={addGroceryStyles.modalTitle}>Add to Grocery List</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={addGroceryStyles.recipeTitle}>{recipe.recipeData.title}</Text>

          {loadingLists ? (
            <View style={addGroceryStyles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* List Selection */}
              <Text style={addGroceryStyles.sectionTitle}>Select Grocery List</Text>
              {showCreateList ? (
                <View style={addGroceryStyles.createListContainer}>
                  <TextInput
                    style={addGroceryStyles.listInput}
                    placeholder="New list name"
                    value={newListName}
                    onChangeText={setNewListName}
                    autoFocus
                  />
                  <View style={addGroceryStyles.createListButtons}>
                    <TouchableOpacity
                      style={addGroceryStyles.cancelButton}
                      onPress={() => {
                        setShowCreateList(false);
                        setNewListName('');
                      }}
                    >
                      <Text style={addGroceryStyles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[addGroceryStyles.createButton, !newListName.trim() && addGroceryStyles.createButtonDisabled]}
                      onPress={createListAndAdd}
                      disabled={!newListName.trim()}
                    >
                      <Text style={addGroceryStyles.createButtonText}>Create</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <FlatList
                    data={lists}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          addGroceryStyles.listItem,
                          selectedListID === item.id && addGroceryStyles.listItemSelected,
                        ]}
                        onPress={() => setSelectedListID(item.id)}
                      >
                        <View style={[
                          addGroceryStyles.radioButton,
                          selectedListID === item.id && addGroceryStyles.radioButtonSelected,
                        ]}>
                          {selectedListID === item.id && (
                            <View style={addGroceryStyles.radioButtonInner} />
                          )}
                        </View>
                        <Text style={addGroceryStyles.listItemText}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                    style={addGroceryStyles.listsList}
                    nestedScrollEnabled
                  />
                  <TouchableOpacity
                    style={addGroceryStyles.newListButton}
                    onPress={() => setShowCreateList(true)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                    <Text style={addGroceryStyles.newListButtonText}>Create New List</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Ingredients Selection */}
              <Text style={addGroceryStyles.sectionTitle}>Select Ingredients</Text>
              {parsingIngredients ? (
                <View style={addGroceryStyles.parsingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={addGroceryStyles.parsingText}>Parsing ingredients...</Text>
                </View>
              ) : (
                <FlatList
                  data={ingredients}
                  keyExtractor={(item, index) => `${item.name}-${index}`}
                  renderItem={({ item, index }) => {
                  const isExactMatch = item.pantryMatch?.matchType === 'exact';
                  const isFuzzyMatch = item.pantryMatch?.matchType === 'fuzzy';

                  return (
                    <TouchableOpacity
                      style={[
                        addGroceryStyles.ingredientItem,
                        isFuzzyMatch && addGroceryStyles.ingredientItemFuzzy,
                        isExactMatch && addGroceryStyles.ingredientItemExact,
                      ]}
                      onPress={() => toggleIngredient(index)}
                    >
                      <View style={[
                        addGroceryStyles.checkbox,
                        item.checked && addGroceryStyles.checkboxChecked,
                        isExactMatch && addGroceryStyles.checkboxExactMatch,
                      ]}>
                        {item.checked && (
                          <Ionicons name="checkmark" size={16} color={colors.surface} />
                        )}
                      </View>
                      <View style={addGroceryStyles.ingredientContent}>
                        <Text style={[
                          addGroceryStyles.ingredientName,
                          isExactMatch && addGroceryStyles.ingredientNameExact,
                        ]}>
                          {item.name}
                        </Text>
                        {item.quantity > 0 && (
                          <Text style={addGroceryStyles.ingredientQuantity}>
                            {item.quantity} {item.unit || ''}
                          </Text>
                        )}
                        {isFuzzyMatch && item.pantryMatch?.item && (
                          <Text style={addGroceryStyles.fuzzyMatchText}>
                            Similar to: {item.pantryMatch.item.name}
                          </Text>
                        )}
                        {isExactMatch && (
                          <Text style={addGroceryStyles.exactMatchText}>
                            ✓ In pantry
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                style={addGroceryStyles.ingredientsList}
                nestedScrollEnabled
              />
              )}

              {/* Action Buttons */}
              <View style={addGroceryStyles.actionButtons}>
                <TouchableOpacity
                  style={[addGroceryStyles.cancelActionButton]}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={addGroceryStyles.cancelActionButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    addGroceryStyles.addButton,
                    (!selectedListID || loading) && addGroceryStyles.addButtonDisabled,
                  ]}
                  onPress={handleAddToGroceryList}
                  disabled={!selectedListID || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.surface} />
                  ) : (
                    <Text style={addGroceryStyles.addButtonText}>
                      Add {ingredients.filter(i => i.checked).length} Item(s)
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Edited Banner Inline Component with Sparkle Animation
function EditedBannerInline() {
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createSparkleAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(800),
        ])
      );
    };

    createSparkleAnimation(sparkle1, 0).start();
    createSparkleAnimation(sparkle2, 150).start();
    createSparkleAnimation(sparkle3, 300).start();
  }, []);

  return (
    <View style={styles.editedBannerInline}>
      <Text style={styles.editedBannerInlineText}>Edited</Text>
      <View style={styles.inlineBannerSparkleContainer}>
        <Animated.View
          style={[
            styles.inlineBannerSparkleDot,
            styles.inlineBannerSparkle1,
            {
              opacity: sparkle1,
              transform: [{
                scale: sparkle1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.2],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.inlineBannerSparkleDot,
            styles.inlineBannerSparkle2,
            {
              opacity: sparkle2,
              transform: [{
                scale: sparkle2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.2],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.inlineBannerSparkleDot,
            styles.inlineBannerSparkle3,
            {
              opacity: sparkle3,
              transform: [{
                scale: sparkle3.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.2],
                }),
              }],
            },
          ]}
        />
      </View>
    </View>
  );
}

// Track Meal Modal Component
interface TrackMealModalProps {
  visible: boolean;
  recipe: Recipe | null;
  currentPortionSize: number | null;
  userProfile: FoodProfile | null;
  onClose: () => void;
  onTrack: (portions: number, date: string, dateQuickSelect: 'today' | 'yesterday' | 'custom') => Promise<void>;
  isTracking: boolean;
  trackingPortions: number;
  setTrackingPortions: (portions: number) => void;
  trackingDateQuickSelect: 'today' | 'yesterday' | 'custom';
  setTrackingDateQuickSelect: (select: 'today' | 'yesterday' | 'custom') => void;
  selectedTrackingDate: string;
  setSelectedTrackingDate: (date: string) => void;
}

function TrackMealModal({
  visible,
  recipe,
  currentPortionSize,
  userProfile,
  onClose,
  onTrack,
  isTracking,
  trackingPortions,
  setTrackingPortions,
  trackingDateQuickSelect,
  setTrackingDateQuickSelect,
  selectedTrackingDate,
  setSelectedTrackingDate,
}: TrackMealModalProps) {
  // Date utility functions
  const getDateStringInTimezone = (date: Date, timezone: string): string => {
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

  const getTodayInTimezone = (timezone: string): Date => {
    const now = new Date();
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
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    return new Date(year, month, day, 0, 0, 0, 0);
  };

  // Initialize tracking state when modal opens
  useEffect(() => {
    if (visible && recipe) {
      setTrackingPortions(1); // Default to 1 portion
      setTrackingDateQuickSelect('today');
      setSelectedTrackingDate('');
    }
  }, [visible, recipe]);

  // Calculate nutrition preview
  const calculateNutritionPreview = () => {
    if (!recipe?.recipeData.nutrition || trackingPortions <= 0) {
      return null;
    }

    const originalPortions = extractPortionNumber(recipe.recipeData.portions);
    const scaleFactor = trackingPortions / originalPortions;
    const scaledNutrition = scaleFactor !== 1
      ? scaleNutrition(recipe.recipeData.nutrition, scaleFactor)
      : recipe.recipeData.nutrition;

    const parseNutritionValue = (value: string): number => {
      if (!value) return 0;
      const match = value.match(/(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0;
    };

    const cleanedCalories = scaledNutrition.calories_per_portion?.replace(/\s*\(estimated by AI\)/gi, '').trim() || '';
    const calories = parseNutritionValue(cleanedCalories) * trackingPortions;
    const protein = parseNutritionValue(scaledNutrition.protein || '') * trackingPortions;
    const carbs = parseNutritionValue(scaledNutrition.carbs || '') * trackingPortions;
    const fat = parseNutritionValue(scaledNutrition.fat || '') * trackingPortions;

    return { calories, protein, carbs, fat };
  };

  const nutritionPreview = calculateNutritionPreview();

  const handleTrackMeal = async () => {
    await onTrack(trackingPortions, selectedTrackingDate, trackingDateQuickSelect);
  };

  const handlePortionChange = (delta: number) => {
    const newPortions = Math.max(0.5, Math.min(10, trackingPortions + delta));
    setTrackingPortions(newPortions);
  };

  const userTimezone = userProfile?.timezone || 'America/New_York';

  if (!recipe) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={addGroceryStyles.modalBackdrop}>
        <View style={addGroceryStyles.modalContent}>
          <View style={addGroceryStyles.modalHeader}>
            <Text style={addGroceryStyles.modalTitle}>Track Meal</Text>
            <TouchableOpacity onPress={onClose} disabled={isTracking}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.trackMealScrollView}
            contentContainerStyle={styles.trackMealScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            <Text style={addGroceryStyles.recipeTitle}>{recipe.recipeData.title}</Text>

            {/* Date Selector - In a card */}
            <View style={styles.trackMealSection}>
              <Text style={styles.trackMealSectionTitle}>Select Date</Text>
              <View style={styles.dateQuickButtons}>
                <TouchableOpacity
                  style={[
                    styles.dateQuickButton,
                    trackingDateQuickSelect === 'today' && styles.dateQuickButtonActive,
                  ]}
                  onPress={() => {
                    setTrackingDateQuickSelect('today');
                    setSelectedTrackingDate('');
                  }}
                  disabled={isTracking}
                >
                  {trackingDateQuickSelect === 'today' && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.surface} style={styles.dateButtonIcon} />
                  )}
                  <Text
                    style={[
                      styles.dateQuickButtonText,
                      trackingDateQuickSelect === 'today' && styles.dateQuickButtonTextActive,
                    ]}
                  >
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dateQuickButton,
                    trackingDateQuickSelect === 'yesterday' && styles.dateQuickButtonActive,
                  ]}
                  onPress={() => {
                    setTrackingDateQuickSelect('yesterday');
                    setSelectedTrackingDate('');
                  }}
                  disabled={isTracking}
                >
                  {trackingDateQuickSelect === 'yesterday' && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.surface} style={styles.dateButtonIcon} />
                  )}
                  <Text
                    style={[
                      styles.dateQuickButtonText,
                      trackingDateQuickSelect === 'yesterday' && styles.dateQuickButtonTextActive,
                    ]}
                  >
                    Yesterday
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.dateQuickButton,
                    trackingDateQuickSelect === 'custom' && styles.dateQuickButtonActive,
                  ]}
                  onPress={() => {
                    setTrackingDateQuickSelect('custom');
                  }}
                  disabled={isTracking}
                >
                  {trackingDateQuickSelect === 'custom' && (
                    <Ionicons name="checkmark-circle" size={18} color={colors.surface} style={styles.dateButtonIcon} />
                  )}
                  <Text
                    style={[
                      styles.dateQuickButtonText,
                      trackingDateQuickSelect === 'custom' && styles.dateQuickButtonTextActive,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              {trackingDateQuickSelect === 'custom' && (
                <View style={styles.customDateInputContainer}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    value={selectedTrackingDate}
                    onChangeText={setSelectedTrackingDate}
                    editable={!isTracking}
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              )}
            </View>

            {/* Portion Selector - In a card */}
            <View style={styles.trackMealSection}>
              <Text style={styles.trackMealSectionTitle}>Portions</Text>
              <View style={styles.portionInputContainer}>
                <TouchableOpacity
                  style={styles.portionButton}
                  onPress={() => handlePortionChange(-0.5)}
                  disabled={isTracking || trackingPortions <= 0.5}
                >
                  <Ionicons
                    name="remove-circle-outline"
                    size={32}
                    color={trackingPortions <= 0.5 ? colors.textSecondary : colors.primary}
                  />
                </TouchableOpacity>
                <View style={styles.portionInputWrapper}>
                  <TextInput
                    style={styles.portionInput}
                    value={trackingPortions.toString()}
                    onChangeText={(text) => {
                      const num = parseFloat(text) || 0;
                      if (num >= 0 && num <= 10) {
                        setTrackingPortions(num);
                      }
                    }}
                    keyboardType="decimal-pad"
                    editable={!isTracking}
                    selectTextOnFocus
                  />
                  <Text style={styles.portionLabel}>portions</Text>
                </View>
                <TouchableOpacity
                  style={styles.portionButton}
                  onPress={() => handlePortionChange(0.5)}
                  disabled={isTracking || trackingPortions >= 10}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={32}
                    color={trackingPortions >= 10 ? colors.textSecondary : colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Nutrition Preview - In a card */}
            {nutritionPreview && (
              <View style={styles.trackMealSection}>
                <Text style={styles.trackMealSectionTitle}>Nutrition Preview</Text>
                <View style={styles.trackingNutrition}>
                  <View style={styles.nutritionItemRow}>
                    <Text style={styles.nutritionItemLabel}>Calories</Text>
                    <Text style={styles.nutritionItemValue}>
                      {Math.round(nutritionPreview.calories).toLocaleString()} <Text style={styles.nutritionItemUnit}>kcal</Text>
                    </Text>
                  </View>
                  <View style={styles.nutritionItemRow}>
                    <Text style={styles.nutritionItemLabel}>Protein</Text>
                    <Text style={styles.nutritionItemValue}>
                      {Math.round(nutritionPreview.protein).toLocaleString()}<Text style={styles.nutritionItemUnit}>g</Text>
                    </Text>
                  </View>
                  <View style={styles.nutritionItemRow}>
                    <Text style={styles.nutritionItemLabel}>Carbs</Text>
                    <Text style={styles.nutritionItemValue}>
                      {Math.round(nutritionPreview.carbs).toLocaleString()}<Text style={styles.nutritionItemUnit}>g</Text>
                    </Text>
                  </View>
                  <View style={[styles.nutritionItemRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.nutritionItemLabel}>Fat</Text>
                    <Text style={styles.nutritionItemValue}>
                      {Math.round(nutritionPreview.fat).toLocaleString()}<Text style={styles.nutritionItemUnit}>g</Text>
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={addGroceryStyles.actionButtons}>
            <TouchableOpacity
              style={addGroceryStyles.cancelActionButton}
              onPress={onClose}
              disabled={isTracking}
            >
              <Text style={addGroceryStyles.cancelActionButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                addGroceryStyles.addButton,
                (trackingPortions <= 0 || isTracking) && addGroceryStyles.addButtonDisabled,
              ]}
              onPress={handleTrackMeal}
              disabled={trackingPortions <= 0.5 || isTracking}
            >
              {isTracking ? (
                <ActivityIndicator size="small" color={colors.surface} />
              ) : (
                <Text style={addGroceryStyles.addButtonText}>Track Meal</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Edited Banner Component with Sparkle Animation
function EditedBanner() {
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createSparkleAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay(800),
        ])
      );
    };

    createSparkleAnimation(sparkle1, 0).start();
    createSparkleAnimation(sparkle2, 150).start();
    createSparkleAnimation(sparkle3, 300).start();
  }, []);

  return (
    <View style={styles.editedBanner}>
      <Text style={styles.editedBannerText}>✨ Edited</Text>
      <View style={styles.bannerSparkleContainer}>
        <Animated.View
          style={[
            styles.bannerSparkleDot,
            styles.bannerSparkle1,
            {
              opacity: sparkle1,
              transform: [{
                scale: sparkle1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.5],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bannerSparkleDot,
            styles.bannerSparkle2,
            {
              opacity: sparkle2,
              transform: [{
                scale: sparkle2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.5],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bannerSparkleDot,
            styles.bannerSparkle3,
            {
              opacity: sparkle3,
              transform: [{
                scale: sparkle3.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1.5],
                }),
              }],
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function RecipesScreen() {
  const router = useRouter();
  const [recipeFilter, setRecipeFilter] = useState<'all' | 'saved'>('all');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddToGrocery, setShowAddToGrocery] = useState(false);
  const [recipeForGrocery, setRecipeForGrocery] = useState<Recipe | null>(null);
  const [userProfile, setUserProfile] = useState<FoodProfile | null>(null);
  const [currentPortionSize, setCurrentPortionSize] = useState<number | null>(null);
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [currentWarnings, setCurrentWarnings] = useState<ScalingWarning[]>([]);
  const warningsShownRef = useRef<string | null>(null);
  // Meal tracking state
  const [trackedMeals, setTrackedMeals] = useState<MealTracking[]>([]);
  const [showTrackMealModal, setShowTrackMealModal] = useState(false);
  const [selectedTrackingDate, setSelectedTrackingDate] = useState<string>('');
  const [trackingPortions, setTrackingPortions] = useState<number>(1);
  const [trackingDateQuickSelect, setTrackingDateQuickSelect] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [isTrackingMeal, setIsTrackingMeal] = useState(false);
  const [isLoadingTrackedMeals, setIsLoadingTrackedMeals] = useState(false);
  const [mealLogExpanded, setMealLogExpanded] = useState(false);
  

  // Enable LayoutAnimation on Android
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  
  // Sparkle animations for edited recipes
  const sparkleAnims = useRef<{ [key: string]: Animated.Value[] }>({});

  useEffect(() => {
    if (auth.currentUser) {
      loadRecipes();
      loadUserProfile();
    }
  }, [recipeFilter]);

  // Date utility functions (similar to home page)
  const getDateStringInTimezone = (date: Date, timezone: string): string => {
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

  const getTodayInTimezone = (timezone: string): Date => {
    const now = new Date();
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
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0') - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    return new Date(year, month, day, 0, 0, 0, 0);
  };

  useEffect(() => {
    if (selectedRecipe) {
      // Calculate initial portion size: userPortionSize || defaultServingSize || originalPortions
      const originalPortions = extractPortionNumber(selectedRecipe.recipeData.portions);
      const initialPortions = selectedRecipe.userPortionSize || 
                             userProfile?.defaultServingSize || 
                             originalPortions;
      setCurrentPortionSize(initialPortions);
      
      // Reset warnings shown flag ONLY when entering a completely different recipe
      const currentRecipeID = selectedRecipe.recipeID;
      if (warningsShownRef.current !== currentRecipeID) {
        warningsShownRef.current = null; // Reset for new recipe
        setShowWarningsModal(false);
      }
    } else {
      setCurrentPortionSize(null);
      setShowWarningsModal(false);
      setCurrentWarnings([]);
      warningsShownRef.current = null;
      setTrackedMeals([]);
    }
  }, [selectedRecipe?.recipeID, userProfile?.defaultServingSize]); // Trigger when recipeID changes or profile loads

  const loadUserProfile = async () => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/profile/${auth.currentUser.uid}`);
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data.profile || null);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setUserProfile(null);
    }
  };

  // Load tracked meals for the selected recipe (last 90 days to catch any meals)
  const loadTrackedMeals = useCallback(async () => {
    if (!auth.currentUser || !selectedRecipe || !userProfile) return;

    setIsLoadingTrackedMeals(true);
    try {
      const userTimezone = userProfile.timezone || 'America/New_York';
      const today = getTodayInTimezone(userTimezone);
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 90); // Last 90 days to catch all meals (including any with wrong dates)
      
      // Also extend end date to future to catch any meals with future dates
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 7); // Include next 7 days in case of timezone issues
      
      const startDateStr = getDateStringInTimezone(startDate, userTimezone);
      const endDateStr = getDateStringInTimezone(endDate, userTimezone);
      
      // Log the actual date calculations for debugging
      console.log(`[loadTrackedMeals] Date calculations:`, {
        todayInTimezone: getDateStringInTimezone(today, userTimezone),
        startDateStr,
        endDateStr,
        userTimezone,
      });

      console.log(`[loadTrackedMeals] Loading meals for recipe ${selectedRecipe.recipeID}, date range: ${startDateStr} to ${endDateStr}`);

      const response = await fetch(
        `${API_BASE}/api/meal-tracking/user/${auth.currentUser.uid}/range?startDate=${startDateStr}&endDate=${endDateStr}`
      );

      if (response.ok) {
        const data = await response.json();
        const dailyData = data.dailyData || {};
        
        console.log(`[loadTrackedMeals] Received dailyData:`, Object.keys(dailyData));
        
        // Collect all meals and filter by recipeID
        const allMeals: MealTracking[] = [];
        Object.values(dailyData).forEach((dayData: any) => {
          if (dayData.meals) {
            dayData.meals.forEach((meal: MealTracking) => {
              console.log(`[loadTrackedMeals] Checking meal: recipeID=${meal.recipeID}, selectedRecipe=${selectedRecipe.recipeID}, match=${meal.recipeID === selectedRecipe.recipeID}`);
              if (meal.recipeID === selectedRecipe.recipeID) {
                allMeals.push(meal);
              }
            });
          }
        });

        console.log(`[loadTrackedMeals] Found ${allMeals.length} meals for recipe ${selectedRecipe.recipeID}`);

        // Sort by date (newest first)
        allMeals.sort((a, b) => {
          const dateA = new Date(a.date + 'T' + a.createdAt.split('T')[1] || '00:00:00');
          const dateB = new Date(b.date + 'T' + b.createdAt.split('T')[1] || '00:00:00');
          return dateB.getTime() - dateA.getTime();
        });

        setTrackedMeals(allMeals);
      } else {
        const errorText = await response.text();
        console.error(`[loadTrackedMeals] Failed to load meals: ${response.status} ${errorText}`);
        setTrackedMeals([]);
      }
    } catch (error) {
      console.error('[loadTrackedMeals] Error loading tracked meals:', error);
      setTrackedMeals([]);
    } finally {
      setIsLoadingTrackedMeals(false);
    }
  }, [selectedRecipe?.recipeID, userProfile]);

  // Load tracked meals when recipe and profile are ready
  useEffect(() => {
    if (selectedRecipe && userProfile) {
      // Auto-expand meal log if there are meals
      loadTrackedMeals().then(() => {
        // This will be updated when trackedMeals state changes
      });
    }
  }, [selectedRecipe?.recipeID, userProfile, loadTrackedMeals]);

  // Auto-expand meal log when meals are loaded
  useEffect(() => {
    if (trackedMeals.length > 0 && !mealLogExpanded) {
      setMealLogExpanded(true);
    }
  }, [trackedMeals.length]);

  const loadRecipes = async () => {
    if (!auth.currentUser) return;

    try {
      const url = recipeFilter === 'saved' 
        ? `${API_BASE}/api/generate-recipe/user/${auth.currentUser.uid}?saved=true`
        : `${API_BASE}/api/generate-recipe/user/${auth.currentUser.uid}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to load recipes');
      }

      const data = await response.json();
      setRecipes(data.recipes || []);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadRecipes();
  };


  // Track a meal
  const trackMeal = async () => {
    if (!auth.currentUser || !selectedRecipe || !userProfile || trackingPortions <= 0) {
      Alert.alert('Error', 'Please enter a valid portion size');
      return;
    }

    setIsTrackingMeal(true);
    try {
      const userTimezone = userProfile.timezone || 'America/New_York';
      let dateToUse = selectedTrackingDate;

      // Determine date based on quick select
      if (trackingDateQuickSelect === 'today') {
        const today = getTodayInTimezone(userTimezone);
        dateToUse = getDateStringInTimezone(today, userTimezone);
      } else if (trackingDateQuickSelect === 'yesterday') {
        const today = getTodayInTimezone(userTimezone);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        dateToUse = getDateStringInTimezone(yesterday, userTimezone);
      } else if (trackingDateQuickSelect === 'custom') {
        if (!dateToUse || !/^\d{4}-\d{2}-\d{2}$/.test(dateToUse)) {
          Alert.alert('Error', 'Please enter a valid date (YYYY-MM-DD)');
          setIsTrackingMeal(false);
          return;
        }
      }

      console.log('[trackMeal] Tracking meal:', {
        userID: auth.currentUser.uid,
        recipeID: selectedRecipe.recipeID,
        portions: trackingPortions,
        date: dateToUse,
        dateQuickSelect: trackingDateQuickSelect,
      });

      const response = await fetch(`${API_BASE}/api/meal-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userID: auth.currentUser.uid,
          recipeID: selectedRecipe.recipeID,
          portions: trackingPortions,
          date: dateToUse,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to track meal');
      }

      const result = await response.json();
      console.log('[trackMeal] Meal tracked successfully:', result.meal);
      
      Alert.alert('Success', 'Meal tracked successfully!');
      setShowTrackMealModal(false);
      // Reset tracking state
      setTrackingPortions(1);
      setTrackingDateQuickSelect('today');
      setSelectedTrackingDate('');
      
      // Reload tracked meals with a small delay to ensure Cosmos has the data
      setTimeout(async () => {
        console.log('[trackMeal] Reloading tracked meals after tracking...');
        await loadTrackedMeals();
      }, 500);
    } catch (error: any) {
      console.error('Failed to track meal:', error);
      Alert.alert('Error', error.message || 'Failed to track meal. Please try again.');
    } finally {
      setIsTrackingMeal(false);
    }
  };

  // Delete a tracked meal
  const deleteTrackedMeal = async (mealID: string) => {
    if (!auth.currentUser) return;

    Alert.alert(
      'Delete Meal',
      'Are you sure you want to remove this tracked meal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!auth.currentUser) return;
            try {
              const response = await fetch(
                `${API_BASE}/api/meal-tracking/${mealID}?userID=${auth.currentUser.uid}`,
                {
                  method: 'DELETE',
                }
              );

              if (!response.ok) {
                throw new Error('Failed to delete meal');
              }

              // Reload tracked meals
              await loadTrackedMeals();
            } catch (error) {
              console.error('Failed to delete meal:', error);
              Alert.alert('Error', 'Failed to delete meal. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handlePortionSizeChange = async (newPortions: number) => {
    if (!selectedRecipe || !auth.currentUser) return;

    setCurrentPortionSize(newPortions);

    // Check for warnings when portion size changes
    const originalPortions = extractPortionNumber(selectedRecipe.recipeData.portions);
    const constraints = detectCookingConstraints(
      selectedRecipe.recipeData.instructions,
      selectedRecipe.recipeData.title,
      selectedRecipe.recipeData.description
    );
    const warnings = checkScalingConstraints(originalPortions, newPortions, constraints);
    
    
    if (warnings.length > 0) {
      setCurrentWarnings(warnings);
      // Only show modal if we haven't shown it for this recipe yet in this session
      if (warningsShownRef.current !== selectedRecipe.recipeID) {
        setShowWarningsModal(true);
        warningsShownRef.current = selectedRecipe.recipeID; // Mark as shown
      }
    } else {
      setShowWarningsModal(false);
      setCurrentWarnings([]);
    }

    // Save to backend
    try {
      const response = await fetch(`${API_BASE}/api/generate-recipe/${selectedRecipe.recipeID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userID: auth.currentUser.uid,
          userPortionSize: newPortions,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Update local state
        setRecipes(prev =>
          prev.map(r => (r.recipeID === selectedRecipe.recipeID ? data.recipe : r))
        );
        setSelectedRecipe(data.recipe);
      }
    } catch (error) {
      console.error('Failed to save portion size:', error);
    }
  };

  const toggleSaveRecipe = async (recipe: Recipe) => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/generate-recipe/${recipe.recipeID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userID: auth.currentUser.uid,
          isSaved: !recipe.isSaved,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update recipe');
      }

      const data = await response.json();
      
      // Update local state
      setRecipes(prev =>
        prev.map(r => (r.recipeID === recipe.recipeID ? data.recipe : r))
      );
      
      if (selectedRecipe?.recipeID === recipe.recipeID) {
        setSelectedRecipe(data.recipe);
      }
    } catch (error) {
      console.error('Failed to toggle save:', error);
    }
  };

  const deleteRecipe = async (recipe: Recipe) => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/generate-recipe/${recipe.recipeID}?userID=${auth.currentUser.uid}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete recipe');
      }

      // Remove from local state
      setRecipes(prev => prev.filter(r => r.recipeID !== recipe.recipeID));
      
      // If deleted recipe was selected, go back to list
      if (selectedRecipe?.recipeID === recipe.recipeID) {
        setSelectedRecipe(null);
      }
    } catch (error) {
      console.error('Failed to delete recipe:', error);
      Alert.alert('Error', 'Failed to delete recipe. Please try again.');
    }
  };

  const handleDeleteRecipe = (recipe: Recipe) => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.recipeData.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRecipe(recipe),
        },
      ]
    );
  };

  const handleEditInChat = async (recipe: Recipe) => {
    if (!auth.currentUser) return;

    try {
      // Create a new conversation
      const convResponse = await fetch(`${API_BASE}/api/chat/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userID: auth.currentUser.uid }),
      });

      if (!convResponse.ok) {
        throw new Error('Failed to create conversation');
      }

      const convData = await convResponse.json();
      const conversationID = convData.conversation.conversationID;

      // Load recipe into chat
      const loadResponse = await fetch(`${API_BASE}/api/chat?action=load-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID,
          recipeID: recipe.recipeID,
          userID: auth.currentUser.uid,
        }),
      });

      if (!loadResponse.ok) {
        throw new Error('Failed to load recipe into chat');
      }

      // Store conversationID temporarily and navigate to chat tab
      // The chat screen will detect editing mode and load this conversation
      // Use navigation params to pass conversationID
      router.push({
        pathname: '/(tabs)/chat',
        params: { editingConversationID: conversationID },
      });
    } catch (error) {
      console.error('Failed to edit recipe in chat:', error);
      Alert.alert('Error', 'Failed to load recipe into chat. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading recipes...</Text>
      </View>
    );
  }

  if (selectedRecipe) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.recipeDetailHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedRecipe(null)}
          >
            <Ionicons name="arrow-back" size={24} color="#212121" />
          </TouchableOpacity>
          <Text style={styles.recipeDetailTitle}>{selectedRecipe.recipeData.title}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => toggleSaveRecipe(selectedRecipe)}
            >
            <Ionicons
              name={selectedRecipe.isSaved ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={colors.primary}
            />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => handleDeleteRecipe(selectedRecipe)}
            >
              <Ionicons
                name="trash-outline"
                size={24}
                color={semanticColors.error}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.recipeDetail}>
          {selectedRecipe.recipeData.imageUrl ? (
            <View style={styles.recipeImageContainer}>
              <Image
                source={{ uri: selectedRecipe.recipeData.imageUrl }}
                style={styles.recipeImage}
                resizeMode="cover"
              />
              {selectedRecipe.isEdited && (
                <EditedBanner />
              )}
            </View>
          ) : (
            <View style={styles.recipeImagePlaceholder}>
              <Ionicons name="restaurant" size={48} color={colors.textSecondary} />
            </View>
          )}
          
          {selectedRecipe.recipeData.description && (
            <Text style={styles.description}>{selectedRecipe.recipeData.description}</Text>
          )}

          {currentPortionSize !== null && (
            <PortionSelector
              portions={currentPortionSize}
              originalPortions={extractPortionNumber(selectedRecipe.recipeData.portions)}
              defaultPortions={userProfile?.defaultServingSize}
              onPortionsChange={handlePortionSizeChange}
            />
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="list" size={20} color={colors.primary} /> Ingredients
            </Text>
            
            {/* Substitution Banner */}
            {selectedRecipe.recipeData.substitutions && selectedRecipe.recipeData.substitutions.length > 0 && (
              <SubstitutionBanner substitutions={selectedRecipe.recipeData.substitutions} />
            )}
            
            {currentPortionSize !== null && (() => {
              const originalPortions = extractPortionNumber(selectedRecipe.recipeData.portions);
              const isScaled = currentPortionSize !== originalPortions;
              
              // Check which ingredients were substituted
              const substitutions = selectedRecipe.recipeData.substitutions || [];
              const substitutedIngredientTexts = new Set(
                substitutions.map(sub => sub.substitutedIngredient.toLowerCase())
              );
              
              return (
                <>
                  {isScaled && (
                    <Text style={styles.scalingNote}>
                      Original: {selectedRecipe.recipeData.portions}
                    </Text>
                  )}
                  {selectedRecipe.recipeData.ingredients.map((ingredient, index) => {
                    const scaledIngredient = isScaled
                      ? scaleIngredient(ingredient, originalPortions, currentPortionSize)
                      : ingredient;
                    const isSubstituted = substitutedIngredientTexts.has(scaledIngredient.toLowerCase());
                    return (
                      <View key={index} style={[
                        styles.ingredientItem,
                        isSubstituted && styles.ingredientItemSubstituted
                      ]}>
                        <Text style={styles.bullet}>•</Text>
                        <View style={styles.ingredientTextContainer}>
                          <Text style={[
                            styles.ingredientText,
                            isSubstituted && styles.ingredientTextSubstituted
                          ]}>
                            {scaledIngredient}
                          </Text>
                          {isSubstituted && (
                            <View style={styles.substitutedBadge}>
                              <Ionicons name="swap-horizontal" size={12} color={semanticColors.warningBorder || '#FFB74D'} />
                              <Text style={styles.substitutedBadgeText}>Substituted</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="receipt" size={20} color={colors.primary} /> Instructions
            </Text>
            {selectedRecipe.recipeData.instructions.map((instruction, index) => (
              <View key={index} style={styles.instructionItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction}</Text>
              </View>
            ))}
          </View>

          {selectedRecipe.recipeData.nutrition && currentPortionSize !== null && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  <Ionicons name="nutrition" size={20} color={colors.primary} /> Nutrition
                </Text>
                {(() => {
                  const originalPortions = extractPortionNumber(selectedRecipe.recipeData.portions);
                  const scaleFactor = currentPortionSize / originalPortions;
                  const scaledNutrition = scaleFactor !== 1
                    ? scaleNutrition(selectedRecipe.recipeData.nutrition, scaleFactor)
                    : selectedRecipe.recipeData.nutrition;
                  
                  // Helper to extract numeric value from nutrition string (e.g., "105g" -> 105)
                  const parseNutritionValue = (value: string): number => {
                    if (!value) return 0;
                    const match = value.match(/(\d+(?:\.\d+)?)/);
                    return match ? parseFloat(match[1]) : 0;
                  };
                  
                  // Calculate total and per portion values
                  const getNutritionDisplay = (value: string | undefined) => {
                    if (!value) return null;
                    const totalValue = parseNutritionValue(value);
                    const perPortionValue = totalValue / currentPortionSize;
                    // Extract unit (e.g., "105g" -> "g")
                    const unitMatch = value.match(/[\d.]+(.+)/);
                    const unit = unitMatch ? unitMatch[1].trim() : '';
                    const formattedPerPortion = `${Math.round(perPortionValue * 10) / 10}${unit ? unit : ''}`;
                    return {
                      total: value, // Keep original format with unit (total for current portion size)
                      perPortion: formattedPerPortion, // Per portion value
                    };
                  };
                  
                  const protein = getNutritionDisplay(scaledNutrition.protein);
                  const carbs = getNutritionDisplay(scaledNutrition.carbs);
                  const fat = getNutritionDisplay(scaledNutrition.fat);
                  
                  // Calculate calories - calories_per_portion is already per portion
                  const getCaloriesDisplay = () => {
                    if (!scaledNutrition.calories_per_portion) return null;
                    // Clean value first to remove "(estimated by AI)" before extracting unit
                    const cleanedCalories = scaledNutrition.calories_per_portion.replace(/\s*\(estimated by AI\)/gi, '').trim();
                    const perPortionValue = parseNutritionValue(cleanedCalories);
                    const totalValue = perPortionValue * currentPortionSize;
                    // Extract unit from cleaned value (e.g., "520 kcal" -> "kcal")
                    const unitMatch = cleanedCalories.match(/[\d.]+(.+)/);
                    const unit = unitMatch ? unitMatch[1].trim() : 'kcal';
                    return {
                      perPortion: `${Math.round(perPortionValue)} ${unit}`,
                      total: `${Math.round(totalValue)} ${unit}`,
                    };
                  };
                  
                  const calories = getCaloriesDisplay();
                  
                  // Check if any nutrition value is estimated by AI
                  const isEstimated = 
                    scaledNutrition.calories_per_portion?.includes('(estimated by AI)') ||
                    scaledNutrition.protein?.includes('(estimated by AI)') ||
                    scaledNutrition.carbs?.includes('(estimated by AI)') ||
                    scaledNutrition.fat?.includes('(estimated by AI)');
                  
                  // Remove "(estimated by AI)" from display values
                  const cleanValue = (value: string) => value.replace(/\s*\(estimated by AI\)/gi, '').trim();
                  
                  return (
                    <View style={styles.nutritionContainer}>
                      {/* Calories - Full width row */}
                      {calories && (
                        <View style={styles.nutritionCaloriesRow}>
                          <View style={styles.nutritionItemFull}>
                            <Text style={styles.nutritionLabel}>Calories</Text>
                            <Text style={styles.nutritionValue}>{cleanValue(calories.perPortion)}</Text>
                            <Text style={styles.nutritionTotal}>total: {cleanValue(calories.total)}</Text>
                          </View>
                        </View>
                      )}
                      
                      {/* Macros - Protein, Carbs, Fat in one row */}
                      <View style={styles.nutritionMacrosRow}>
                        {protein && (
                          <View style={styles.nutritionItem}>
                            <Text style={styles.nutritionLabel}>Protein</Text>
                            <Text style={styles.nutritionValue}>{cleanValue(protein.perPortion)}</Text>
                            <Text style={styles.nutritionTotal}>total: {cleanValue(protein.total)}</Text>
                          </View>
                        )}
                        {carbs && (
                          <View style={styles.nutritionItem}>
                            <Text style={styles.nutritionLabel}>Carbs</Text>
                            <Text style={styles.nutritionValue}>{cleanValue(carbs.perPortion)}</Text>
                            <Text style={styles.nutritionTotal}>total: {cleanValue(carbs.total)}</Text>
                          </View>
                        )}
                        {fat && (
                          <View style={styles.nutritionItem}>
                            <Text style={styles.nutritionLabel}>Fat</Text>
                            <Text style={styles.nutritionValue}>{cleanValue(fat.perPortion)}</Text>
                            <Text style={styles.nutritionTotal}>total: {cleanValue(fat.total)}</Text>
                          </View>
                        )}
                      </View>
                      
                      {/* Estimated by AI note */}
                      {isEstimated && (
                        <Text style={styles.nutritionEstimatedNote}>* All values estimated by AI</Text>
                      )}
                    </View>
                  );
                })()}
              </View>

            </>
          )}

          {selectedRecipe.recipeData.sourceUrl && (
            <TouchableOpacity 
              style={styles.sourceButton}
              onPress={() => Linking.openURL(selectedRecipe.recipeData.sourceUrl)}
            >
              <Ionicons name="link" size={16} color={colors.accent} />
              <Text style={styles.sourceButtonText}>View Original Recipe</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => handleEditInChat(selectedRecipe)}
          >
            <Ionicons name="chatbubbles" size={20} color={colors.surface} />
            <Text style={styles.editButtonText}>Edit in Chat</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.addToGroceryButton}
            onPress={() => {
              setRecipeForGrocery(selectedRecipe);
              setShowAddToGrocery(true);
            }}
          >
            <Ionicons name="cart" size={20} color={colors.surface} />
            <Text style={styles.addToGroceryButtonText}>Add to Grocery List</Text>
          </TouchableOpacity>

          {/* Track Meal Card */}
          <View style={styles.trackMealCard}>
            {/* Header Row */}
            <View style={styles.trackMealHeader}>
              <Ionicons name="checkmark-circle" size={24} color={semanticColors.success} />
              <Text style={styles.trackMealHeaderTitle}>Track Meal</Text>
            </View>

            {/* Add Meal Button */}
            <TouchableOpacity
              style={styles.trackMealAddButton}
              onPress={() => setShowTrackMealModal(true)}
              disabled={!selectedRecipe?.recipeData.nutrition}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={styles.trackMealAddButtonText}>Add Meal</Text>
            </TouchableOpacity>

            {/* Meal Log Section */}
            {trackedMeals.length > 0 && (
              <View style={styles.trackMealLogSection}>
                <View style={styles.trackMealLogHeaderRow}>
                  <TouchableOpacity
                    onPress={() => setMealLogExpanded(!mealLogExpanded)}
                    style={styles.trackMealLogHeaderButton}
                  >
                    <Text style={styles.trackMealLogHeader}>
                      Meal Log {mealLogExpanded ? '▼' : '▶'} ({trackedMeals.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={loadTrackedMeals}
                    style={styles.refreshButton}
                    disabled={isLoadingTrackedMeals}
                  >
                    <Ionicons 
                      name="refresh" 
                      size={18} 
                      color={isLoadingTrackedMeals ? colors.textSecondary : colors.primary} 
                    />
                  </TouchableOpacity>
                </View>
                {mealLogExpanded && (
                  <View style={styles.mealsListContainer}>
                    {isLoadingTrackedMeals ? (
                      <View style={styles.trackMealEmptyState}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.trackMealEmptyText}>Loading meals...</Text>
                      </View>
                    ) : (
                      trackedMeals.map((meal) => {
                        const mealDate = new Date(meal.date + 'T00:00:00');
                        const formattedDate = mealDate.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: mealDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
                        });

                        return (
                          <View key={meal.id} style={styles.mealCard}>
                            <View style={styles.mealCardHeader}>
                              <View style={styles.mealCardHeaderLeft}>
                                <View style={styles.mealCardIconCircle}>
                                  <Ionicons name="restaurant" size={20} color={colors.surface} />
                                </View>
                                <View style={styles.mealCardHeaderText}>
                                  <Text style={styles.mealCardDate}>{formattedDate}</Text>
                                  <View style={styles.mealCardBadge}>
                                    <Text style={styles.mealCardBadgeText}>
                                      {meal.portions} {meal.portions === 1 ? 'portion' : 'portions'}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              <TouchableOpacity
                                onPress={() => deleteTrackedMeal(meal.id)}
                                style={styles.mealCardDeleteButton}
                              >
                                <Ionicons name="trash-outline" size={20} color={semanticColors.error} />
                              </TouchableOpacity>
                            </View>
                            <View style={styles.mealCardContent}>
                              <Text style={styles.mealCardNutrition}>
                                {Math.round(meal.nutrition.calories)} kcal •{' '}
                                {Math.round(meal.nutrition.protein)}g protein •{' '}
                                {Math.round(meal.nutrition.carbs)}g carbs •{' '}
                                {Math.round(meal.nutrition.fat)}g fat
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            )}

            {trackedMeals.length === 0 && !isLoadingTrackedMeals && (
              <View style={styles.trackMealLogSection}>
                <Text style={styles.trackMealLogHeader}>Meal Log</Text>
                <View style={styles.trackMealEmptyState}>
                  <Ionicons name="document-text-outline" size={44} color={colors.textSecondary} />
                  <Text style={styles.trackMealEmptyText}>No meals tracked yet</Text>
                  <Text style={styles.trackMealEmptyHint}>Tap 'Add Meal' to get started</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <AddToGroceryModal
          visible={showAddToGrocery}
          recipe={recipeForGrocery}
          onClose={() => {
            setShowAddToGrocery(false);
            setRecipeForGrocery(null);
          }}
        />

        <ScalingWarningsModal
          visible={showWarningsModal}
          warnings={currentWarnings}
          onClose={() => setShowWarningsModal(false)}
        />

        <TrackMealModal
          visible={showTrackMealModal}
          recipe={selectedRecipe}
          currentPortionSize={currentPortionSize}
          userProfile={userProfile}
          onClose={() => setShowTrackMealModal(false)}
          onTrack={async (portions, date, dateQuickSelect) => {
            setTrackingPortions(portions);
            setSelectedTrackingDate(date);
            setTrackingDateQuickSelect(dateQuickSelect);
            await trackMeal();
          }}
          isTracking={isTrackingMeal}
          trackingPortions={trackingPortions}
          setTrackingPortions={setTrackingPortions}
          trackingDateQuickSelect={trackingDateQuickSelect}
          setTrackingDateQuickSelect={setTrackingDateQuickSelect}
          selectedTrackingDate={selectedTrackingDate}
          setSelectedTrackingDate={setSelectedTrackingDate}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="My Recipes" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} found
          </Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tabButton, recipeFilter === 'all' && styles.tabButtonActive]}
            onPress={() => setRecipeFilter('all')}
          >
            <Text style={[styles.tabButtonText, recipeFilter === 'all' && styles.tabButtonTextActive]}>
              All Recipes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, recipeFilter === 'saved' && styles.tabButtonActive]}
            onPress={() => setRecipeFilter('saved')}
          >
            <Ionicons 
              name="bookmark" 
              size={16} 
              color={recipeFilter === 'saved' ? colors.surface : colors.textSecondary} 
            />
            <Text style={[styles.tabButtonText, recipeFilter === 'saved' && styles.tabButtonTextActive]}>
              Saved Recipes
            </Text>
          </TouchableOpacity>
        </View>

      {recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.emptyText}>
            {recipeFilter === 'saved' ? 'No saved recipes yet' : 'No recipes yet'}
          </Text>
          <Text style={styles.emptySubtext}>
            {recipeFilter === 'saved' 
              ? 'Bookmark recipes you like to view them here'
              : 'Chat with the AI to discover and save recipes!'}
          </Text>
        </View>
      ) : (
        <View style={styles.recipeList}>
          {recipes.map(recipe => (
            <TouchableOpacity
              key={recipe.recipeID}
              style={styles.recipeCard}
              onPress={() => setSelectedRecipe(recipe)}
            >
              <View style={styles.recipeCardContent}>
                <View style={styles.recipeCardImageWrapper}>
                  {recipe.recipeData.imageUrl ? (
                    <View style={styles.recipeCardImageContainer}>
                      <Image
                        source={{ uri: recipe.recipeData.imageUrl }}
                        style={styles.recipeCardImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    <View style={styles.recipeCardImagePlaceholder}>
                      <Ionicons name="restaurant" size={24} color={colors.textSecondary} />
                    </View>
                  )}
                  {recipe.isEdited && (
                    <EditedBannerInline />
                  )}
                  {recipe.hasSubstitutions && (
                    <View style={styles.substitutionBannerInline}>
                      <Ionicons name="swap-horizontal" size={10} color={colors.surface} />
                      <Text style={styles.substitutionBannerInlineText}>Substituted</Text>
                    </View>
                  )}
                </View>
                <View style={styles.recipeCardText}>
                  <View style={styles.recipeCardHeader}>
                    <Text style={styles.recipeCardTitle} numberOfLines={2}>{recipe.recipeData.title}</Text>
                    <View style={styles.recipeCardHeaderActions}>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setRecipeForGrocery(recipe);
                          setShowAddToGrocery(true);
                        }}
                        style={styles.cardActionButton}
                      >
                        <Ionicons name="cart-outline" size={20} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleSaveRecipe(recipe);
                        }}
                        style={styles.cardActionButton}
                      >
                        <Ionicons
                          name={recipe.isSaved ? 'bookmark' : 'bookmark-outline'}
                          size={24}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {recipe.recipeData.description && (
                    <Text style={styles.recipeCardDescription} numberOfLines={2}>
                      {recipe.recipeData.description}
                    </Text>
                  )}
                  <View style={styles.recipeCardMeta}>
                    <View style={styles.recipeCardMetaItem}>
                      <Ionicons name="people" size={14} color={colors.textSecondary} />
                      <Text style={styles.recipeCardMetaText} numberOfLines={1}>{recipe.recipeData.portions}</Text>
                    </View>
                    {recipe.recipeData.nutrition?.calories_per_portion && (
                      <View style={styles.recipeCardMetaItem}>
                        <Ionicons name="flame" size={14} color={colors.textSecondary} />
                        <Text style={styles.recipeCardMetaText} numberOfLines={1}>
                          {recipe.recipeData.nutrition.calories_per_portion}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
      </ScrollView>

      <AddToGroceryModal
        visible={showAddToGrocery}
        recipe={recipeForGrocery}
        currentPortionSize={currentPortionSize}
        onClose={() => {
          setShowAddToGrocery(false);
          setRecipeForGrocery(null);
        }}
      />

      <ScalingWarningsModal
        visible={showWarningsModal}
        warnings={currentWarnings}
        onClose={() => setShowWarningsModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabSwitcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.surface,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  recipeList: {
    gap: 16,
  },
  recipeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeCardContent: {
    flexDirection: 'row',
    gap: 12,
  },
  recipeCardImageWrapper: {
    width: 100,
    alignItems: 'center',
  },
  recipeCardImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recipeCardImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  editedBannerInline: {
    marginTop: 6,
    width: 100, // Span full width of image
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: colors.edited,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  editedBannerInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inlineBannerSparkleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineBannerSparkleDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 1.5,
  },
  inlineBannerSparkle1: {
    top: '25%',
    left: '20%',
  },
  inlineBannerSparkle2: {
    top: '30%',
    right: '25%',
  },
  inlineBannerSparkle3: {
    bottom: '30%',
    left: '50%',
  },
  substitutionBannerInline: {
    marginTop: 6,
    width: 100, // Span full width of image
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: semanticColors.warningBorder || '#FFB74D',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  substitutionBannerInlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recipeCardImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardText: {
    flex: 1,
    flexShrink: 1,
  },
  recipeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recipeCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
    flexShrink: 1,
  },
  recipeCardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  recipeCardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  recipeCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    flexShrink: 1,
  },
  recipeCardMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    flexShrink: 1,
  },
  recipeDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  recipeDetailTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 4,
  },
  saveButton: {
    padding: 4,
    marginLeft: 12,
  },
  recipeDetail: {
    padding: 20,
  },
  recipeImageContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  recipeImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  editedBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.edited,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: colors.secondary, // Theme grey border below banner
  },
  editedBannerText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  bannerSparkleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerSparkleDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 1)',
    borderRadius: 2.5,
  },
  bannerSparkle1: {
    top: '20%',
    left: '15%',
  },
  bannerSparkle2: {
    top: '25%',
    right: '20%',
  },
  bannerSparkle3: {
    top: '30%',
    left: '50%',
  },
  recipeImagePlaceholder: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  metaInfo: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  scalingNote: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 8,
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  ingredientItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 16,
    color: colors.textPrimary,
    marginRight: 8,
    marginTop: 2,
  },
  ingredientText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    flex: 1,
  },
  ingredientTextContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ingredientItemSubstituted: {
    backgroundColor: semanticColors.warningBackground || '#FFF4E6',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  ingredientTextSubstituted: {
    fontWeight: '600',
  },
  substitutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: semanticColors.warningBorder || '#FFB74D',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  substitutedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.surface,
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  nutritionContainer: {
    gap: 12,
  },
  nutritionCaloriesRow: {
    width: '100%',
  },
  nutritionItemFull: {
    width: '100%',
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
  },
  nutritionMacrosRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nutritionItem: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
  },
  nutritionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  nutritionValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nutritionTotal: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  nutritionEstimatedNote: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  sourceButtonText: {
    flex: 1,
    fontSize: 14,
    color: colors.accent,
    fontWeight: '500',
    marginLeft: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  addToGroceryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  addToGroceryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  recipeCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionButton: {
    padding: 4,
  },
  // Track Meal Card Styles
  trackMealCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  trackMealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  trackMealHeaderIcon: {
    // Icon styling handled inline
  },
  trackMealHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  trackMealAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 8,
  },
  trackMealAddButtonIcon: {
    // Icon styling handled inline
  },
  trackMealAddButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.primary,
  },
  trackMealLogSection: {
    marginTop: 16,
  },
  trackMealLogHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  trackMealEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  trackMealEmptyIcon: {
    // Icon styling handled inline
  },
  trackMealEmptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  trackMealEmptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  trackMealLogHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  trackMealLogHeaderButton: {
    flex: 1,
  },
  refreshButton: {
    padding: 4,
  },
  mealsListContainer: {
    marginTop: 12,
    gap: 12,
  },
  mealCard: {
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  mealCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mealCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCardHeaderText: {
    flex: 1,
    gap: 4,
  },
  mealCardDate: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mealCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealCardBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  mealCardDeleteButton: {
    padding: 4,
  },
  mealCardContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 12,
  },
  mealCardNutrition: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  // Track Meal Modal Styles
  trackMealSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  trackMealSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  trackMealScrollView: {
    flex: 1,
  },
  trackMealScrollContent: {
    paddingBottom: 8,
  },
  dateQuickButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dateQuickButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    flexDirection: 'row',
    gap: 6,
  },
  dateQuickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dateQuickButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  dateQuickButtonTextActive: {
    color: colors.surface,
    fontWeight: '700',
  },
  dateButtonIcon: {
    marginRight: 4,
  },
  customDateInputContainer: {
    marginTop: 12,
  },
  dateInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
  },
  trackingNutrition: {
    padding: 4,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nutritionItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nutritionItemLabel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  nutritionItemValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  nutritionItemUnit: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  portionInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 16,
  },
  portionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  portionInputWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  portionInput: {
    minWidth: 100,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  portionLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

const addGroceryStyles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
    flex: 1,
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  parsingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  parsingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 12,
  },
  listsList: {
    maxHeight: 150,
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    marginBottom: 8,
  },
  listItemSelected: {
    backgroundColor: colors.primary + '20',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: colors.primary,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  listItemText: {
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1,
  },
  newListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    gap: 8,
  },
  newListButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  createListContainer: {
    marginBottom: 12,
  },
  listInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: 12,
  },
  createListButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  createButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    color: colors.surface,
    fontWeight: '600',
  },
  ingredientsList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    marginBottom: 8,
  },
  ingredientItemFuzzy: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    paddingLeft: 16,
  },
  ingredientItemExact: {
    backgroundColor: colors.primary + '15',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxExactMatch: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ingredientContent: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  ingredientNameExact: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  ingredientQuantity: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  fuzzyMatchText: {
    fontSize: 11,
    color: colors.accent,
    fontStyle: 'italic',
    marginTop: 4,
  },
  exactMatchText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cancelActionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelActionButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  addButton: {
    flex: 2,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  // Meal tracking styles
  trackingContainer: {
    padding: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Meal list container
  mealsListContainer: {
    marginTop: 16,
    gap: 12,
  },
  // Individual meal card
  mealCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  mealCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mealCardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealCardHeaderText: {
    flex: 1,
    gap: 6,
  },
  mealCardDate: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  mealCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  mealCardBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mealCardContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 16,
  },
  // Date selector styles
  dateSelectorRow: {
    marginBottom: 16,
    gap: 12,
  },
  dateInputContainer: {
    marginBottom: 16,
  },
  dateInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  dateInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
  },
  dateInputCompact: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    marginBottom: 4,
  },
  trackingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  trackingNutritionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nutritionBreakdown: {
    gap: 12,
  },
  trackingButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  trackingButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  trackingButtonPrimary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  trackingButtonSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  trackingButtonDanger: {
    backgroundColor: semanticColors.error || '#F44336',
  },
  trackingButtonCancel: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
  },
  trackingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  trackingButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  trackingButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});

