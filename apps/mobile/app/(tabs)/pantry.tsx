import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, semanticColors } from '@plateful/shared';
import type { PantryItem, PantryCategory, CommonIngredient } from '@plateful/shared';
import { COMMON_INGREDIENTS, getIngredientsByCategory, CATEGORY_NAMES } from '@plateful/shared';
import Header from '../../src/components/Header';
import { auth } from '../../src/config/firebase';
import { API_BASE } from '../../src/config/api';

interface QuantityModalProps {
  visible: boolean;
  ingredient: CommonIngredient | null;
  onClose: () => void;
  onConfirm: (quantity: number, unit: string) => void;
}

function QuantityModal({ visible, ingredient, onClose, onConfirm }: QuantityModalProps) {
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');

  useEffect(() => {
    if (ingredient) {
      setUnit(ingredient.commonUnits?.[0] || '');
      setQuantity('');
    }
  }, [ingredient]);

  const handleConfirm = () => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid quantity');
      return;
    }
    onConfirm(qty, unit);
    setQuantity('');
  };

  if (!ingredient) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add {ingredient.name}</Text>
              
              <View style={styles.quantityRow}>
                <TextInput
                  style={styles.quantityInput}
                  placeholder="0"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  autoFocus
                />
                
                {ingredient.commonUnits && ingredient.commonUnits.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.unitScroll}>
                    {ingredient.commonUnits.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.unitChip, unit === u && styles.unitChipActive]}
                        onPress={() => setUnit(u)}
                      >
                        <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <TextInput
                    style={styles.unitInput}
                    placeholder="unit"
                    value={unit}
                    onChangeText={setUnit}
                  />
                )}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalButtonCancel} onPress={onClose}>
                  <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButtonConfirm} onPress={handleConfirm}>
                  <Text style={styles.modalButtonTextConfirm}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export default function PantryScreen() {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [customInput, setCustomInput] = useState('');
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<CommonIngredient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const groupedIngredients = getIngredientsByCategory();
  const pantryItemNames = new Set(pantryItems.map(item => item.name.toLowerCase()));

  useEffect(() => {
    if (auth.currentUser) {
      loadPantryItems();
    }
  }, []);

  const loadPantryItems = async () => {
    if (!auth.currentUser) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/pantry/${auth.currentUser.uid}`);
      
      if (!response.ok) {
        throw new Error('Failed to load pantry items');
      }

      const data = await response.json();
      setPantryItems(data.items || []);
    } catch (error) {
      console.error('Failed to load pantry items:', error);
      Alert.alert('Error', 'Failed to load pantry items');
    } finally {
      setLoading(false);
    }
  };

  const addPantryItem = async (name: string, category: PantryCategory, quantity?: number, unit?: string) => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/pantry/${auth.currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            name,
            category,
            quantity,
            unit,
          }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add item');
      }

      const data = await response.json();
      if (data.duplicates && data.duplicates.length > 0) {
        Alert.alert('Duplicate', `${name} is already in your pantry`);
        return;
      }

      await loadPantryItems();
    } catch (error) {
      console.error('Failed to add pantry item:', error);
      Alert.alert('Error', 'Failed to add item to pantry');
    }
  };

  const removePantryItem = async (itemId: string) => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/pantry/${auth.currentUser.uid}/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to remove item');
      }

      await loadPantryItems();
    } catch (error) {
      console.error('Failed to remove pantry item:', error);
      Alert.alert('Error', 'Failed to remove item from pantry');
    }
  };

  const handleIngredientPress = (ingredient: CommonIngredient) => {
    // Check if already in pantry
    if (pantryItemNames.has(ingredient.name.toLowerCase())) {
      Alert.alert('Already Added', `${ingredient.name} is already in your pantry`);
      return;
    }

    if (ingredient.requiresQuantity) {
      setSelectedIngredient(ingredient);
      setShowQuantityModal(true);
    } else {
      addPantryItem(ingredient.name, ingredient.category);
    }
  };

  const handleQuantityConfirm = (quantity: number, unit: string) => {
    if (selectedIngredient) {
      addPantryItem(selectedIngredient.name, selectedIngredient.category, quantity, unit);
      setShowQuantityModal(false);
      setSelectedIngredient(null);
    }
  };

  const handleCustomAdd = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    // Check if already in pantry
    if (pantryItemNames.has(trimmed.toLowerCase())) {
      Alert.alert('Already Added', `${trimmed} is already in your pantry`);
      setCustomInput('');
      return;
    }

    addPantryItem(trimmed, 'other');
    setCustomInput('');
  };

  // Group pantry items by category
  const pantryByCategory: Record<string, PantryItem[]> = {};
  pantryItems.forEach(item => {
    if (!pantryByCategory[item.category]) {
      pantryByCategory[item.category] = [];
    }
    pantryByCategory[item.category].push(item);
  });

  // Filter ingredients by search query
  const filteredIngredients = searchQuery
    ? COMMON_INGREDIENTS.filter(ing => 
        ing.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : COMMON_INGREDIENTS;

  const filteredGrouped = searchQuery
    ? Object.entries(groupedIngredients).reduce((acc, [cat, items]) => {
        const filtered = items.filter(ing => 
          ing.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {} as Record<string, CommonIngredient[]>)
    : groupedIngredients;

  return (
    <View style={styles.container}>
      <Header title="My Pantry" />
      
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search ingredients..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Add Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Add</Text>
          <Text style={styles.sectionSubtitle}>Tap to add common ingredients</Text>
          
          {Object.entries(filteredGrouped).map(([category, ingredients]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{CATEGORY_NAMES[category] || category}</Text>
              <View style={styles.chipContainer}>
                {ingredients.map((ingredient) => {
                  const isAdded = pantryItemNames.has(ingredient.name.toLowerCase());
                  return (
                    <TouchableOpacity
                      key={ingredient.name}
                      style={[
                        styles.chip,
                        isAdded && styles.chipAdded,
                      ]}
                      onPress={() => !isAdded && handleIngredientPress(ingredient)}
                      disabled={isAdded}
                    >
                      <Text style={[styles.chipText, isAdded && styles.chipTextAdded]}>
                        {ingredient.name}
                        {isAdded && ' ✓'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Custom Add Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Custom Ingredient</Text>
          <View style={styles.customInputRow}>
            <TextInput
              style={styles.customInput}
              placeholder="Enter ingredient name..."
              value={customInput}
              onChangeText={setCustomInput}
              onSubmitEditing={handleCustomAdd}
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity
              style={[styles.addButton, !customInput.trim() && styles.addButtonDisabled]}
              onPress={handleCustomAdd}
              disabled={!customInput.trim()}
            >
              <Ionicons name="add" size={24} color={colors.surface} />
            </TouchableOpacity>
          </View>
        </View>

        {/* My Pantry List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            My Pantry ({pantryItems.length})
          </Text>
          
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : pantryItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="basket-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Your pantry is empty</Text>
              <Text style={styles.emptySubtext}>
                Add ingredients above to track what you have
              </Text>
            </View>
          ) : (
            Object.entries(pantryByCategory).map(([category, items]) => (
              <View key={category} style={styles.pantryCategorySection}>
                <Text style={styles.categoryTitle}>{CATEGORY_NAMES[category] || category}</Text>
                {items.map((item) => (
                  <View key={item.id} style={styles.pantryItem}>
                    <View style={styles.pantryItemContent}>
                      <Text style={styles.pantryItemName}>{item.name}</Text>
                      {item.quantity && item.unit && (
                        <Text style={styles.pantryItemQuantity}>
                          {item.quantity} {item.unit}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => removePantryItem(item.id)}
                    >
                      <Ionicons name="trash-outline" size={20} color={semanticColors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <QuantityModal
        visible={showQuantityModal}
        ingredient={selectedIngredient}
        onClose={() => {
          setShowQuantityModal(false);
          setSelectedIngredient(null);
        }}
        onConfirm={handleQuantityConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider || '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
    marginTop: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
  },
  chipAdded: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  chipTextAdded: {
    color: colors.surface,
  },
  customInputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  customInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    fontSize: 16,
    color: colors.textPrimary,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  pantryCategorySection: {
    marginBottom: 16,
  },
  pantryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: 8,
  },
  pantryItemContent: {
    flex: 1,
  },
  pantryItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pantryItemQuantity: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 40,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 24,
    textAlign: 'center',
  },
  quantityRow: {
    marginBottom: 24,
  },
  quantityInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  unitScroll: {
    maxHeight: 50,
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  unitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  unitChipTextActive: {
    color: colors.surface,
  },
  unitInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  modalButtonConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    color: colors.surface,
    fontWeight: '600',
  },
});

