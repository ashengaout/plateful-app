import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, semanticColors } from '@plateful/shared';
import type { GroceryList, GroceryItem, PantryItem, PantryCategory, CommonIngredient } from '@plateful/shared';
import { findPantryMatch, COMMON_INGREDIENTS, getIngredientsByCategory, CATEGORY_NAMES, CATEGORY_ORDER, detectPantryCategory } from '@plateful/shared';
import { groupGroceryItems, type GroupedGroceryItems } from '@plateful/shared/src/utils/grocery-grouping';
import { ScrollView, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';
import Header from '../../src/components/Header';
import { auth } from '../../src/config/firebase';
import { API_BASE } from '../../src/config/api';

type ViewMode = 'lists' | 'items';
type GroceryTab = 'lists' | 'pantry';

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
        <View style={pantryStyles.modalBackdrop}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={pantryStyles.modalContent}>
              <Text style={pantryStyles.modalTitle}>Add {ingredient.name}</Text>
              
              <View style={pantryStyles.quantityRow}>
                <TextInput
                  style={pantryStyles.quantityInput}
                  placeholder="0"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                  autoFocus
                />
                
                {ingredient.commonUnits && ingredient.commonUnits.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pantryStyles.unitScroll}>
                    {ingredient.commonUnits.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[pantryStyles.unitChip, unit === u && pantryStyles.unitChipActive]}
                        onPress={() => setUnit(u)}
                      >
                        <Text style={[pantryStyles.unitChipText, unit === u && pantryStyles.unitChipTextActive]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <TextInput
                    style={pantryStyles.unitInput}
                    placeholder="unit"
                    value={unit}
                    onChangeText={setUnit}
                  />
                )}
              </View>

              <View style={pantryStyles.modalButtons}>
                <TouchableOpacity style={pantryStyles.modalButtonCancel} onPress={onClose}>
                  <Text style={pantryStyles.modalButtonTextCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={pantryStyles.modalButtonConfirm} onPress={handleConfirm}>
                  <Text style={pantryStyles.modalButtonTextConfirm}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// Pantry View Component
function PantryViewContent({ 
  pantryItems, 
  loadPantryItems,
  onSwitchToLists
}: { 
  pantryItems: PantryItem[]; 
  loadPantryItems: () => Promise<void>;
  onSwitchToLists: () => void;
}) {
  const router = useRouter();
  const [customInput, setCustomInput] = useState('');
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<CommonIngredient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAllIngredientsExpanded, setIsAllIngredientsExpanded] = useState(false);

  const groupedIngredients = getIngredientsByCategory();
  const pantryItemNames = new Set(pantryItems.map(item => item.name.toLowerCase()));

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
    if (pantryItemNames.has(trimmed.toLowerCase())) {
      Alert.alert('Already Added', `${trimmed} is already in your pantry`);
      setCustomInput('');
      return;
    }
    addPantryItem(trimmed, 'other');
    setCustomInput('');
  };

  const pantryByCategory: Record<string, PantryItem[]> = {};
  pantryItems.forEach(item => {
    if (!pantryByCategory[item.category]) {
      pantryByCategory[item.category] = [];
    }
    pantryByCategory[item.category].push(item);
  });

  // Filter ingredients by search query and exclude items already in pantry
  const filteredGrouped = searchQuery
    ? Object.entries(groupedIngredients).reduce((acc, [cat, items]) => {
        const filtered = items.filter(ing => 
          ing.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !pantryItemNames.has(ing.name.toLowerCase())
        );
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {} as Record<string, CommonIngredient[]>)
    : Object.entries(groupedIngredients).reduce((acc, [cat, items]) => {
        const filtered = items.filter(ing => 
          !pantryItemNames.has(ing.name.toLowerCase())
        );
        if (filtered.length > 0) acc[cat] = filtered;
        return acc;
      }, {} as Record<string, CommonIngredient[]>);

  // Get all categories that have either pantry items or available quick-add ingredients
  const allCategories = new Set<string>();
  Object.keys(pantryByCategory).forEach(cat => allCategories.add(cat));
  Object.keys(filteredGrouped).forEach(cat => allCategories.add(cat));
  
  // Sort categories using CATEGORY_ORDER (with 'other' always last)
  const sortedCategories = Array.from(allCategories).sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a as PantryCategory);
    const indexB = CATEGORY_ORDER.indexOf(b as PantryCategory);
    
    // If both are in the order, sort by their position
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    // If only one is in the order, prioritize it
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    // If neither is in the order, sort alphabetically
    // But 'other' should always be last
    if (a === 'other') return 1;
    if (b === 'other') return -1;
    const nameA = CATEGORY_NAMES[a] || a;
    const nameB = CATEGORY_NAMES[b] || b;
    return nameA.localeCompare(nameB);
  });

  return (
    <View style={styles.container}>
      <Header title="Groceries" />
      
      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, styles.tabButtonInactive]}
          onPress={onSwitchToLists}
        >
          <Ionicons name="list" size={18} color={colors.textSecondary} />
          <Text style={styles.tabButtonText}>Lists</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, styles.tabButtonActive]}
        >
          <Ionicons name="basket" size={18} color={colors.surface} />
          <Text style={[styles.tabButtonText, styles.tabButtonTextActive]}>Pantry</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={pantryStyles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textSecondary} style={pantryStyles.searchIcon} />
          <TextInput
            style={pantryStyles.searchInput}
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

        {/* All Ingredients Expandable Section */}
        {pantryItems.length > 0 && (
          <View style={pantryStyles.expandableCard}>
            <TouchableOpacity 
              onPress={() => setIsAllIngredientsExpanded(!isAllIngredientsExpanded)}
              style={pantryStyles.expandableHeader}
            >
              <View style={pantryStyles.expandableHeaderContent}>
                <Text style={pantryStyles.expandableTitle}>All Ingredients</Text>
                <View style={pantryStyles.countBadge}>
                  <Text style={pantryStyles.countBadgeText}>{pantryItems.length}</Text>
                </View>
              </View>
              <Ionicons 
                name={isAllIngredientsExpanded ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
            
            {isAllIngredientsExpanded && (
              <View style={pantryStyles.expandableContent}>
                <View style={pantryStyles.compactTagsContainer}>
                  {pantryItems.map((item) => (
                    <View key={item.id} style={pantryStyles.compactTag}>
                      <Text style={pantryStyles.compactTagText}>
                        {item.name}
                        {item.quantity && item.unit && ` (${item.quantity} ${item.unit})`}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={pantryStyles.findRecipesButton}
                  onPress={() => {
                    router.push({
                      pathname: '/(tabs)/chat',
                      params: { pantryInspired: 'true' },
                    });
                  }}
                >
                  <Ionicons name="restaurant" size={18} color={colors.surface} />
                  <Text style={pantryStyles.findRecipesButtonText}>
                    Find Recipes Inspired by My Pantry
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Custom Add Section */}
        <View style={pantryStyles.section}>
          <Text style={pantryStyles.sectionTitle}>Add Custom Ingredient</Text>
          <View style={pantryStyles.customInputRow}>
            <TextInput
              style={pantryStyles.customInput}
              placeholder="Enter ingredient name..."
              value={customInput}
              onChangeText={setCustomInput}
              onSubmitEditing={handleCustomAdd}
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity
              style={[pantryStyles.addButton, !customInput.trim() && pantryStyles.addButtonDisabled]}
              onPress={handleCustomAdd}
              disabled={!customInput.trim()}
            >
              <Ionicons name="add" size={24} color={colors.surface} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Category-Based Sections */}
        {sortedCategories.length === 0 && pantryItems.length === 0 ? (
          <View style={pantryStyles.section}>
            <View style={pantryStyles.emptyContainer}>
              <Ionicons name="basket-outline" size={64} color={colors.textSecondary} />
              <Text style={pantryStyles.emptyText}>Your pantry is empty</Text>
              <Text style={pantryStyles.emptySubtext}>
                Add ingredients above to track what you have
              </Text>
            </View>
          </View>
        ) : (
          sortedCategories.map((category) => {
            const pantryItemsInCategory = pantryByCategory[category] || [];
            const quickAddIngredients = filteredGrouped[category] || [];
            const hasContent = pantryItemsInCategory.length > 0 || quickAddIngredients.length > 0;

            if (!hasContent) return null;

            return (
              <View key={category} style={pantryStyles.section}>
                <Text style={pantryStyles.sectionTitle}>
                  {CATEGORY_NAMES[category] || category}
                </Text>

                {/* Pantry Items in this category */}
                {pantryItemsInCategory.length > 0 && (
                  <View style={pantryStyles.pantryCategorySection}>
                    {pantryItemsInCategory.map((item) => (
                      <View key={item.id} style={pantryStyles.pantryItem}>
                        <View style={pantryStyles.pantryItemContent}>
                          <Text style={pantryStyles.pantryItemName}>{item.name}</Text>
                          {item.quantity && item.unit && (
                            <Text style={pantryStyles.pantryItemQuantity}>
                              {item.quantity} {item.unit}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={pantryStyles.deleteButton}
                          onPress={() => removePantryItem(item.id)}
                        >
                          <Ionicons name="trash-outline" size={20} color={semanticColors.error} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Quick-add bubbles for ingredients not in pantry */}
                {quickAddIngredients.length > 0 && (
                  <View style={pantryStyles.categorySection}>
                    {pantryItemsInCategory.length > 0 && (
                      <Text style={pantryStyles.quickAddLabel}>Quick Add</Text>
                    )}
                    <View style={pantryStyles.chipContainer}>
                      {quickAddIngredients.map((ingredient) => (
                        <TouchableOpacity
                          key={ingredient.name}
                          style={pantryStyles.chip}
                          onPress={() => handleIngredientPress(ingredient)}
                        >
                          <Text style={pantryStyles.chipText}>
                            {ingredient.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Quantity Modal */}
      {showQuantityModal && selectedIngredient && (
        <QuantityModal
          visible={showQuantityModal}
          ingredient={selectedIngredient}
          onClose={() => {
            setShowQuantityModal(false);
            setSelectedIngredient(null);
          }}
          onConfirm={handleQuantityConfirm}
        />
      )}
    </View>
  );
}

export default function Groceries() {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [selectedList, setSelectedList] = useState<GroceryList | null>(null);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('lists');
  const [activeTab, setActiveTab] = useState<GroceryTab>('lists');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedListIDs, setSelectedListIDs] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeListName, setMergeListName] = useState('');
  const [loadingMerge, setLoadingMerge] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [addingToPantry, setAddingToPantry] = useState(false);

  useEffect(() => {
    if (auth.currentUser) {
      loadLists();
      loadPantryItems();
    }
  }, []);

  // Reload lists when screen comes into focus (e.g., after adding items from recipe)
  useFocusEffect(
    useCallback(() => {
      if (auth.currentUser && viewMode === 'lists') {
        loadLists();
      }
    }, [viewMode])
  );

  const loadLists = async () => {
    if (!auth.currentUser) return;

    try {
      setLoading(true);
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
      setLoading(false);
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

  const loadListItems = async (listID: string) => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/grocery/${auth.currentUser.uid}/lists/${listID}`);
      
      if (!response.ok) {
        throw new Error('Failed to load list items');
      }

      const data = await response.json();
      const fullList: GroceryList = data.list;
      setSelectedList(fullList);
      setViewMode('items');
    } catch (error) {
      console.error('Failed to load list items:', error);
      Alert.alert('Error', 'Failed to load list items');
    }
  };

  const toggleItemCompletion = async (item: GroceryItem) => {
    if (!auth.currentUser || !selectedList) return;

    try {
      const response = await fetch(
        `${API_BASE}/api/grocery/${auth.currentUser.uid}/lists/${selectedList.id}/items/${item.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            completed: !item.completed,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update item');
      }

      const data = await response.json();
      
      // Update local state
      if (selectedList) {
        const updatedItems = selectedList.items.map(i => 
          i.id === item.id ? data.item : i
        );
        setSelectedList({ ...selectedList, items: updatedItems });
      }
    } catch (error: any) {
      console.error('Failed to toggle item:', error);
      Alert.alert('Error', error.message || 'Failed to update item');
    }
  };

  const addCompletedItemsToPantry = async () => {
    if (!auth.currentUser || !selectedList) return;

    const completedItems = selectedList.items.filter(item => item.completed);
    if (completedItems.length === 0) {
      Alert.alert('No Items', 'No completed items to add to pantry');
      return;
    }

    setAddingToPantry(true);
    try {
      // Map completed items to pantry item format
      const pantryItems = completedItems.map(item => ({
        name: item.name,
        category: item.category || detectPantryCategory(item.name),
        quantity: item.quantity,
        unit: item.unit,
      }));

      const response = await fetch(`${API_BASE}/api/pantry/${auth.currentUser.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pantryItems }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || 'Failed to add items to pantry');
      }

      const data = await response.json();
      const addedCount = data.items?.length || 0;
      const duplicateCount = data.duplicates?.length || 0;

      // Reload pantry items
      await loadPantryItems();

      // Show success message
      if (duplicateCount > 0) {
        Alert.alert(
          'Items Added',
          `Added ${addedCount} item(s) to pantry. ${duplicateCount} duplicate(s) skipped.`
        );
      } else {
        Alert.alert('Success', `Added ${addedCount} item(s) to pantry`);
      }
    } catch (error: any) {
      console.error('Failed to add items to pantry:', error);
      Alert.alert('Error', error.message || 'Failed to add items to pantry');
    } finally {
      setAddingToPantry(false);
    }
  };

  const deleteList = async (listID: string) => {
    if (!auth.currentUser) return;

    Alert.alert(
      'Delete List',
      'Are you sure you want to delete this list? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!auth.currentUser) return;
              
              const response = await fetch(
                `${API_BASE}/api/grocery?userID=${auth.currentUser.uid}&action=deleteList&listID=${listID}`,
                { method: 'DELETE' }
              );

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.details || 'Failed to delete list');
              }

              await loadLists();
              if (selectedList?.id === listID) {
                setSelectedList(null);
                setViewMode('lists');
              }
            } catch (error: any) {
              console.error('Failed to delete list:', error);
              Alert.alert('Error', error.message || 'Failed to delete list');
            }
          },
        },
      ]
    );
  };

  const createList = async (name: string) => {
    if (!auth.currentUser || !name.trim()) return;

    setLoadingCreate(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/grocery/${auth.currentUser.uid}/lists`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create list');
      }

      await loadLists();
      setShowCreateModal(false);
      setNewListName('');
    } catch (error: any) {
      console.error('Failed to create list:', error);
      Alert.alert('Error', error.message || 'Failed to create list');
    } finally {
      setLoadingCreate(false);
    }
  };

  const toggleListSelection = (listID: string) => {
    const newSelection = new Set(selectedListIDs);
    if (newSelection.has(listID)) {
      newSelection.delete(listID);
    } else {
      newSelection.add(listID);
    }
    setSelectedListIDs(newSelection);
  };

  const handleMergeLists = async () => {
    if (!auth.currentUser || selectedListIDs.size < 2) return;

    setLoadingMerge(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/grocery/${auth.currentUser.uid}/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listIDs: Array.from(selectedListIDs),
            name: mergeListName.trim() || undefined,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to merge lists');
      }

      const data = await response.json();
      
      Alert.alert('Success', data.message || 'Lists merged successfully');
      
      // Reset selection and reload
      setMultiSelectMode(false);
      setSelectedListIDs(new Set());
      setShowMergeModal(false);
      setMergeListName('');
      await loadLists();
      
      // Open the merged list
      if (data.list) {
        await loadListItems(data.list.id);
      }
    } catch (error: any) {
      console.error('Failed to merge lists:', error);
      Alert.alert('Error', error.message || 'Failed to merge lists');
    } finally {
      setLoadingMerge(false);
    }
  };

  const handleCreateList = () => {
    setShowCreateModal(true);
  };

  const handleCreateConfirm = () => {
    if (newListName.trim()) {
      createList(newListName.trim());
    } else {
      Alert.alert('Invalid Name', 'Please enter a name for your list');
    }
  };

  const renderListItem = ({ item }: { item: GroceryList }) => {
    const isSelected = selectedListIDs.has(item.id);
    const itemCount = item.itemCount ?? item.items?.length ?? 0;

    return (
      <TouchableOpacity
        style={[
          styles.listCard,
          multiSelectMode && isSelected && styles.listCardSelected,
        ]}
        onPress={() => {
          if (multiSelectMode) {
            toggleListSelection(item.id);
          } else {
            loadListItems(item.id);
          }
        }}
        onLongPress={() => {
          if (!multiSelectMode) {
            setMultiSelectMode(true);
            setSelectedListIDs(new Set([item.id]));
          }
        }}
      >
        <View style={styles.listCardContent}>
          {multiSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          <View style={styles.listCardText}>
            <Text style={styles.listCardTitle}>{item.name}</Text>
            <Text style={styles.listCardSubtitle}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
          </View>
          {!multiSelectMode && (
            <View style={styles.listCardActions}>
              <TouchableOpacity
                onPress={() => deleteList(item.id)}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={20} color={semanticColors.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroceryItem = (item: GroceryItem) => {
    const pantryMatch = findPantryMatch(item.name, pantryItems);
    const isFuzzyMatch = pantryMatch.matchType === 'fuzzy';
    const isExactMatch = pantryMatch.matchType === 'exact';

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.listItem,
          isFuzzyMatch && styles.listItemFuzzyMatch,
          isExactMatch && item.completed && styles.listItemCompleted,
        ]}
        onPress={() => toggleItemCompletion(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
          {item.completed && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.itemContent}>
          <Text style={[styles.itemText, item.completed && styles.itemTextChecked]}>
            {item.name}
          </Text>
          {item.quantity > 1 && item.unit && (
            <Text style={styles.itemQuantity}>
              {item.quantity} {item.unit}
            </Text>
          )}
          {item.notes && (
            <Text style={styles.itemNotes}>
              {item.notes}
            </Text>
          )}
          {isFuzzyMatch && pantryMatch.item && (
            <Text style={styles.fuzzyMatchHint}>
              Similar to: {pantryMatch.item.name}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupedItems = (groupedItems: GroupedGroceryItems[]) => {
    return groupedItems.map(categoryGroup => (
      <View key={categoryGroup.category} style={styles.categorySection}>
        <Text style={styles.categoryTitle}>
          {categoryGroup.category === 'seasonings' ? 'Seasonings' : 
           categoryGroup.category.charAt(0).toUpperCase() + categoryGroup.category.slice(1)}
        </Text>
        {categoryGroup.groups.map((similarGroup, groupIdx) => (
          <View key={`${categoryGroup.category}-${groupIdx}`}>
            {similarGroup.map(item => renderGroceryItem(item))}
          </View>
        ))}
      </View>
    ));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Grocery Lists" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading lists...</Text>
        </View>
      </View>
    );
  }

  if (viewMode === 'items' && selectedList) {
    // Separate active and completed items
    const activeItems = selectedList.items.filter(item => !item.completed);
    const completedItems = selectedList.items.filter(item => item.completed);

    // Group items using smart grouping
    const groupedActiveItems = activeItems.length > 0 ? groupGroceryItems(activeItems) : [];
    const groupedCompletedItems = completedItems.length > 0 ? groupGroceryItems(completedItems) : [];

    return (
      <View style={styles.container}>
        <View style={styles.headerWithBack}>
          <TouchableOpacity
            onPress={() => {
              setViewMode('lists');
              setSelectedList(null);
              setCompletedExpanded(false);
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Header title={selectedList.name} />
        </View>
        {selectedList.items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No items yet</Text>
            <Text style={styles.emptySubtext}>
              Tap + to add items to this list
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          >
            {/* Active Items */}
            {groupedActiveItems.length > 0 && renderGroupedItems(groupedActiveItems)}

            {/* Completed Items Section */}
            {completedItems.length > 0 && (
              <View style={styles.completedSection}>
                <View style={styles.completedHeader}>
                  <TouchableOpacity
                    style={styles.completedHeaderLeft}
                    onPress={() => setCompletedExpanded(!completedExpanded)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.completedHeaderText}>
                      Completed Items ({completedItems.length})
                    </Text>
                    <Ionicons
                      name={completedExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addToPantryButton, addingToPantry && styles.addToPantryButtonDisabled]}
                    onPress={addCompletedItemsToPantry}
                    disabled={addingToPantry}
                    activeOpacity={0.7}
                  >
                    {addingToPantry ? (
                      <ActivityIndicator size="small" color={colors.surface} />
                    ) : (
                      <>
                        <Ionicons name="basket-outline" size={16} color={colors.surface} />
                        <Text style={styles.addToPantryButtonText}>Add to Pantry</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                {completedExpanded && (
                  <View style={styles.completedContent}>
                    {renderGroupedItems(groupedCompletedItems)}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  // If viewing pantry tab, render pantry content
  if (activeTab === 'pantry') {
    return (
      <PantryViewContent 
        pantryItems={pantryItems} 
        loadPantryItems={loadPantryItems}
        onSwitchToLists={() => setActiveTab('lists')}
      />
    );
  }

  // Otherwise render grocery lists
  return (
    <View style={styles.container}>
      <Header title="Grocery Lists" />
      
      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'lists' && styles.tabButtonActive]}
          onPress={() => setActiveTab('lists')}
        >
          <Ionicons 
            name="list" 
            size={18} 
            color={activeTab === 'lists' ? colors.surface : colors.textSecondary} 
          />
          <Text style={[styles.tabButtonText, activeTab === 'lists' && styles.tabButtonTextActive]}>
            Lists
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'pantry' && styles.tabButtonActive]}
          onPress={() => setActiveTab('pantry')}
        >
          <Ionicons 
            name="basket" 
            size={18} 
            color={activeTab === 'pantry' ? colors.surface : colors.textSecondary} 
          />
          <Text style={[styles.tabButtonText, activeTab === 'pantry' && styles.tabButtonTextActive]}>
            Pantry
          </Text>
        </TouchableOpacity>
      </View>
      
      {multiSelectMode && (
        <View style={styles.multiSelectBar}>
          <TouchableOpacity
            onPress={() => {
              setMultiSelectMode(false);
              setSelectedListIDs(new Set());
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.selectCount}>
            {selectedListIDs.size} selected
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (selectedListIDs.size >= 2) {
                setShowMergeModal(true);
              } else {
                Alert.alert('Select Lists', 'Please select at least 2 lists to merge');
              }
            }}
            disabled={selectedListIDs.size < 2}
          >
            <Text
              style={[
                styles.mergeText,
                selectedListIDs.size < 2 && styles.mergeTextDisabled,
              ]}
            >
              Merge
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {lists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No lists yet</Text>
          <Text style={styles.emptySubtext}>
            Tap + to create your first grocery list
          </Text>
        </View>
      ) : (
        <FlatList
          data={lists}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create List Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCreateModal(false);
          setNewListName('');
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Grocery List</Text>
            <Text style={styles.modalSubtitle}>
              Enter a name for your new list
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="List name"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              onSubmitEditing={handleCreateConfirm}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateModal(false);
                  setNewListName('');
                }}
                disabled={loadingCreate}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleCreateConfirm}
                disabled={loadingCreate || !newListName.trim()}
              >
                {loadingCreate ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Merge Modal */}
      <Modal
        visible={showMergeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMergeModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Merge Lists</Text>
            <Text style={styles.modalSubtitle}>
              Merging {selectedListIDs.size} list(s)
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Name for merged list (optional)"
              value={mergeListName}
              onChangeText={setMergeListName}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowMergeModal(false);
                  setMergeListName('');
                }}
                disabled={loadingMerge}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleMergeLists}
                disabled={loadingMerge}
              >
                {loadingMerge ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Merge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Button */}
      {!multiSelectMode && (
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.8}
          onPress={handleCreateList}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWithBack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  multiSelectBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  selectCount: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mergeText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  mergeTextDisabled: {
    color: colors.textSecondary,
    opacity: 0.5,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  listCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  listCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listCardText: {
    flex: 1,
    marginLeft: 12,
  },
  listCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  listCardSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  listCardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteButton: {
    padding: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  listItemFuzzyMatch: {
    backgroundColor: colors.background,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    paddingLeft: 12,
  },
  listItemCompleted: {
    opacity: 0.6,
  },
  itemContent: {
    flex: 1,
    marginLeft: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  itemTextChecked: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  itemQuantity: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  fuzzyMatchHint: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 4,
    fontStyle: 'italic',
  },
  scrollContainer: {
    flex: 1,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  completedSection: {
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: 16,
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  completedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  completedHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 8,
  },
  addToPantryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  addToPantryButtonDisabled: {
    opacity: 0.6,
  },
  addToPantryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
  },
  completedContent: {
    paddingTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addButton: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addButtonText: {
    color: colors.surface,
    fontSize: 32,
    fontWeight: '300',
    marginTop: -2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonConfirm: {
    backgroundColor: colors.primary,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  tabSwitcher: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonInactive: {
    backgroundColor: colors.background,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.surface,
  },
});

const pantryStyles = StyleSheet.create({
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
  quickAddLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
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
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  modalButtonCancel: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
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
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
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
  expandableCard: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
    overflow: 'hidden',
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  expandableHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.surface,
  },
  expandableContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider || '#E0E0E0',
  },
  compactTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    marginBottom: 16,
  },
  compactTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border || '#E0E0E0',
  },
  compactTagText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  findRecipesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginTop: 8,
  },
  findRecipesButtonText: {
    fontSize: 15,
    color: colors.surface,
    fontWeight: '600',
  },
});
