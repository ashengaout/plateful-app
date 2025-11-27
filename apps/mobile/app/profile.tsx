import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@plateful/ui';
import Header from '../src/components/Header';
import { auth } from '../src/config/firebase';
import { API_BASE } from '../src/config/api';
import type { FoodProfile } from '@plateful/shared';
import { colors } from '@plateful/shared';
import { Input } from '@plateful/ui';
import {
  COMMON_LIKES,
  COMMON_DISLIKES,
  COMMON_ALLERGENS,
  COMMON_RESTRICTIONS,
  COMMON_EQUIPMENT,
} from '@plateful/shared';

// Comprehensive international timezones grouped by region
const TIMEZONE_GROUPS = [
  {
    region: 'Americas',
    timezones: [
      { value: 'America/New_York', label: 'Eastern Time (ET)' },
      { value: 'America/Chicago', label: 'Central Time (CT)' },
      { value: 'America/Denver', label: 'Mountain Time (MT)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
      { value: 'America/Phoenix', label: 'Arizona (MST)' },
      { value: 'America/Anchorage', label: 'Alaska (AKST)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
      { value: 'America/Toronto', label: 'Toronto, Canada' },
      { value: 'America/Vancouver', label: 'Vancouver, Canada' },
      { value: 'America/Mexico_City', label: 'Mexico City' },
      { value: 'America/Sao_Paulo', label: 'São Paulo, Brazil' },
      { value: 'America/Buenos_Aires', label: 'Buenos Aires, Argentina' },
      { value: 'America/Lima', label: 'Lima, Peru' },
      { value: 'America/Santiago', label: 'Santiago, Chile' },
    ],
  },
  {
    region: 'Europe',
    timezones: [
      { value: 'Europe/London', label: 'London, UK' },
      { value: 'Europe/Paris', label: 'Paris, France' },
      { value: 'Europe/Berlin', label: 'Berlin, Germany' },
      { value: 'Europe/Rome', label: 'Rome, Italy' },
      { value: 'Europe/Madrid', label: 'Madrid, Spain' },
      { value: 'Europe/Amsterdam', label: 'Amsterdam, Netherlands' },
      { value: 'Europe/Stockholm', label: 'Stockholm, Sweden' },
      { value: 'Europe/Moscow', label: 'Moscow, Russia' },
      { value: 'Europe/Istanbul', label: 'Istanbul, Turkey' },
      { value: 'Europe/Athens', label: 'Athens, Greece' },
      { value: 'Europe/Dublin', label: 'Dublin, Ireland' },
      { value: 'Europe/Zurich', label: 'Zurich, Switzerland' },
    ],
  },
  {
    region: 'Asia',
    timezones: [
      { value: 'Asia/Tokyo', label: 'Tokyo, Japan' },
      { value: 'Asia/Shanghai', label: 'Shanghai, China' },
      { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
      { value: 'Asia/Singapore', label: 'Singapore' },
      { value: 'Asia/Seoul', label: 'Seoul, South Korea' },
      { value: 'Asia/Bangkok', label: 'Bangkok, Thailand' },
      { value: 'Asia/Jakarta', label: 'Jakarta, Indonesia' },
      { value: 'Asia/Manila', label: 'Manila, Philippines' },
      { value: 'Asia/Kolkata', label: 'Mumbai, India' },
      { value: 'Asia/Dubai', label: 'Dubai, UAE' },
      { value: 'Asia/Riyadh', label: 'Riyadh, Saudi Arabia' },
      { value: 'Asia/Tehran', label: 'Tehran, Iran' },
      { value: 'Asia/Karachi', label: 'Karachi, Pakistan' },
    ],
  },
  {
    region: 'Pacific',
    timezones: [
      { value: 'Australia/Sydney', label: 'Sydney, Australia' },
      { value: 'Australia/Melbourne', label: 'Melbourne, Australia' },
      { value: 'Australia/Brisbane', label: 'Brisbane, Australia' },
      { value: 'Australia/Perth', label: 'Perth, Australia' },
      { value: 'Pacific/Auckland', label: 'Auckland, New Zealand' },
      { value: 'Pacific/Fiji', label: 'Fiji' },
    ],
  },
  {
    region: 'Africa',
    timezones: [
      { value: 'Africa/Cairo', label: 'Cairo, Egypt' },
      { value: 'Africa/Johannesburg', label: 'Johannesburg, South Africa' },
      { value: 'Africa/Lagos', label: 'Lagos, Nigeria' },
      { value: 'Africa/Nairobi', label: 'Nairobi, Kenya' },
      { value: 'Africa/Casablanca', label: 'Casablanca, Morocco' },
    ],
  },
];

// Helper function to get UTC offset for a timezone
const getUTCOffset = (timezone: string): string => {
  try {
    // Use a fixed UTC date to calculate offset consistently
    const testDate = new Date('2024-06-15T12:00:00Z');
    
    // Format the same UTC moment in both UTC and the target timezone
    const utcTime = testDate.toLocaleString('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const tzTime = testDate.toLocaleString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    // Parse times (format: "HH:MM")
    const [utcH, utcM] = utcTime.split(':').map(Number);
    const [tzH, tzM] = tzTime.split(':').map(Number);
    
    // Calculate offset in minutes
    let offsetMinutes = (tzH * 60 + tzM) - (utcH * 60 + utcM);
    
    // Normalize to -12 to +12 hours range (handle day rollover)
    if (offsetMinutes > 12 * 60) {
      offsetMinutes -= 24 * 60;
    } else if (offsetMinutes < -12 * 60) {
      offsetMinutes += 24 * 60;
    }
    
    // Format as UTC+/-HH:MM
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    
    if (minutes === 0) {
      return `UTC${sign}${hours.toString().padStart(2, '0')}:00`;
    } else {
      return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  } catch (error) {
    return 'UTC';
  }
};

// Flatten timezones for searching
const ALL_TIMEZONES = TIMEZONE_GROUPS.flatMap(group =>
  group.timezones.map(tz => ({ ...tz, region: group.region }))
);

// Pre-calculate UTC offsets for all timezones (performed once at module load)
const TIMEZONE_OFFSETS = new Map<string, string>();
ALL_TIMEZONES.forEach(tz => {
  TIMEZONE_OFFSETS.set(tz.value, getUTCOffset(tz.value));
});

type TabType = 'info' | 'preferences' | 'macros';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  onTagAdded?: (tag: string) => void;
  placeholder?: string;
}

function TagInput({ value, onChange, onTagAdded, placeholder = 'Add item...' }: TagInputProps) {
  const [inputText, setInputText] = useState('');

  const addTag = () => {
    const trimmed = inputText.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      if (onTagAdded) {
        onTagAdded(trimmed);
      }
      setInputText('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  return (
    <View style={styles.tagInputContainer}>
      <View style={styles.tagInput}>
        <TextInput
          style={styles.tagInputField}
          value={inputText}
          onChangeText={setInputText}
          placeholder={placeholder}
          onSubmitEditing={addTag}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addTagButton} onPress={addTag}>
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {value.length > 0 && (
        <View style={styles.tagList}>
          {value.map((tag, index) => (
            <TouchableOpacity
              key={index}
              style={styles.tag}
              onPress={() => removeTag(tag)}
            >
              <Text style={styles.tagText}>{tag}</Text>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// Timezone Picker Modal Component
function TimezonePickerModal({
  visible,
  onClose,
  selectedTimezone,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selectedTimezone: string;
  onSelect: (timezone: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter timezones based on search
  const filteredGroups = TIMEZONE_GROUPS.map(group => ({
    region: group.region,
    timezones: group.timezones.filter(tz =>
      tz.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tz.value.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(group => group.timezones.length > 0);

  const handleSelect = (timezone: string) => {
    onSelect(timezone);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Timezone</Text>
                <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                  <Ionicons name="close" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalSearchContainer}>
                <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search timezones..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={colors.textSecondary}
                />
              </View>

              <FlatList
                data={filteredGroups}
                keyExtractor={(item) => item.region}
                style={styles.modalList}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item: group }) => (
              <View style={styles.timezoneGroup}>
                <Text style={styles.timezoneGroupHeader}>{group.region}</Text>
                {group.timezones.map((tz) => {
                  const utcOffset = TIMEZONE_OFFSETS.get(tz.value) || 'UTC';
                  return (
                    <TouchableOpacity
                      key={tz.value}
                      style={[
                        styles.timezoneModalItem,
                        selectedTimezone === tz.value && styles.timezoneModalItemSelected,
                      ]}
                      onPress={() => handleSelect(tz.value)}
                    >
                      <View style={styles.timezoneModalItemContent}>
                        <Text
                          style={[
                            styles.timezoneModalItemText,
                            selectedTimezone === tz.value && styles.timezoneModalItemTextSelected,
                          ]}
                        >
                          {tz.label}
                        </Text>
                        <Text
                          style={[
                            styles.timezoneModalItemOffset,
                            selectedTimezone === tz.value && styles.timezoneModalItemOffsetSelected,
                          ]}
                        >
                          {utcOffset}
                        </Text>
                      </View>
                      {selectedTimezone === tz.value && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// Cooking Proficiency Slider Component
function CookingProficiencySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const labels = ['Beginner', 'Novice', 'Intermediate', 'Experienced', 'Advanced'];
  
  // Create custom slider using TouchableOpacity buttons
  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderButtons}>
        {[1, 2, 3, 4, 5].map((level) => (
          <TouchableOpacity
            key={level}
            style={[
              styles.sliderButton,
              value === level && styles.sliderButtonSelected,
            ]}
            onPress={() => onChange(level)}
          >
            <Text
              style={[
                styles.sliderButtonText,
                value === level && styles.sliderButtonTextSelected,
              ]}
            >
              {level}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.sliderLabel}>{labels[value - 1]}</Text>
      {value === 1 && (
        <View style={styles.kidFriendlyBox}>
          <Text style={styles.kidFriendlyEmoji}>👨‍🍳👩‍🍳</Text>
          <Text style={styles.kidFriendlyText}>
            Kid-friendly recipes with simple steps and fun ingredients!
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<FoodProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [timezoneModalVisible, setTimezoneModalVisible] = useState(false);

  // Form state
  const [likes, setLikes] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [likesCustom, setLikesCustom] = useState<string[]>([]);
  const [dislikesCustom, setDislikesCustom] = useState<string[]>([]);
  const [allergensCustom, setAllergensCustom] = useState<string[]>([]);
  const [restrictionsCustom, setRestrictionsCustom] = useState<string[]>([]);
  const [preferredEquipment, setPreferredEquipment] = useState<string[]>([]);
  const [unavailableEquipment, setUnavailableEquipment] = useState<string[]>([]);
  const [preferredEquipmentCustom, setPreferredEquipmentCustom] = useState<string[]>([]);
  const [unavailableEquipmentCustom, setUnavailableEquipmentCustom] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [cookingProficiency, setCookingProficiency] = useState<number>(3); // Default to Intermediate
  const [defaultServingSize, setDefaultServingSize] = useState<string>('');
  // Macro targets state
  const [caloriesTarget, setCaloriesTarget] = useState<string>('');
  const [proteinTarget, setProteinTarget] = useState<string>('');
  const [carbsTarget, setCarbsTarget] = useState<string>('');
  const [fatTarget, setFatTarget] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadProfile();
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/profile/${user.uid}`);
      
      if (response.ok) {
        const data = await response.json();
        const loadedProfile = data.profile;
        setProfile(loadedProfile);
        
        if (loadedProfile.displayName) {
          setDisplayName(loadedProfile.displayName);
        } else if (user?.displayName) {
          setDisplayName(user.displayName);
        } else {
          setDisplayName('');
        }
        
        if (loadedProfile.timezone) {
          setTimezone(loadedProfile.timezone);
        } else {
          setTimezone('America/New_York');
        }

        if (loadedProfile.cookingProficiency) {
          setCookingProficiency(loadedProfile.cookingProficiency);
        } else {
          setCookingProficiency(3); // Default to Intermediate
        }

        if (loadedProfile.defaultServingSize) {
          setDefaultServingSize(loadedProfile.defaultServingSize.toString());
        } else {
          setDefaultServingSize('');
        }

        // Load macro targets
        if (loadedProfile.dailyMacroTargets) {
          setCaloriesTarget(loadedProfile.dailyMacroTargets.calories?.toString() || '');
          setProteinTarget(loadedProfile.dailyMacroTargets.protein?.toString() || '');
          setCarbsTarget(loadedProfile.dailyMacroTargets.carbs?.toString() || '');
          setFatTarget(loadedProfile.dailyMacroTargets.fat?.toString() || '');
        } else {
          setCaloriesTarget('');
          setProteinTarget('');
          setCarbsTarget('');
          setFatTarget('');
        }
        
        const likesCommon = loadedProfile.likes.filter(l => COMMON_LIKES.includes(l));
        const likesCustom_ = loadedProfile.likes.filter(l => !COMMON_LIKES.includes(l));
        const dislikesCommon = loadedProfile.dislikes.filter(d => COMMON_DISLIKES.includes(d));
        const dislikesCustom_ = loadedProfile.dislikes.filter(d => !COMMON_DISLIKES.includes(d));
        const allergensCommon = loadedProfile.allergens.filter(a => COMMON_ALLERGENS.includes(a));
        const allergensCustom_ = loadedProfile.allergens.filter(a => !COMMON_ALLERGENS.includes(a));
        const restrictionsCommon = loadedProfile.restrictions.filter(r => COMMON_RESTRICTIONS.includes(r));
        const restrictionsCustom_ = loadedProfile.restrictions.filter(r => !COMMON_RESTRICTIONS.includes(r));

        setLikes([...likesCommon, ...likesCustom_]);
        setLikesCustom(likesCustom_);
        setDislikes([...dislikesCommon, ...dislikesCustom_]);
        setDislikesCustom(dislikesCustom_);
        setAllergens([...allergensCommon, ...allergensCustom_]);
        setAllergensCustom(allergensCustom_);
        setRestrictions([...restrictionsCommon, ...restrictionsCustom_]);
        setRestrictionsCustom(restrictionsCustom_);

        // Load equipment preferences
        const preferredEquipmentList = loadedProfile.preferredEquipment || [];
        const preferredCommon = preferredEquipmentList.filter(e => COMMON_EQUIPMENT.includes(e));
        const preferredCustom_ = preferredEquipmentList.filter(e => !COMMON_EQUIPMENT.includes(e));
        setPreferredEquipment([...preferredCommon, ...preferredCustom_]);
        setPreferredEquipmentCustom(preferredCustom_);

        const unavailableEquipmentList = loadedProfile.unavailableEquipment || [];
        const unavailableCommon = unavailableEquipmentList.filter(e => COMMON_EQUIPMENT.includes(e));
        const unavailableCustom_ = unavailableEquipmentList.filter(e => !COMMON_EQUIPMENT.includes(e));
        setUnavailableEquipment([...unavailableCommon, ...unavailableCustom_]);
        setUnavailableEquipmentCustom(unavailableCustom_);
      } else if (response.status === 404) {
        setProfile(null);
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (item: string, currentList: string[], setList: (items: string[]) => void) => {
    if (currentList.includes(item)) {
      setList(currentList.filter(i => i !== item));
    } else {
      setList([...currentList, item]);
    }
  };

  const saveProfile = async () => {
    if (!user) return;

    try {
      setSaving(true);
      
      const allLikes = likes;
      const allDislikes = dislikes;
      const allAllergens = allergens;
      const allRestrictions = restrictions;
      const allPreferredEquipment = preferredEquipment;
      const allUnavailableEquipment = unavailableEquipment;

      const url = `${API_BASE}/api/profile/${user.uid}`;
      
      // Build macro targets object (only include if values are set)
      const dailyMacroTargets: {
        calories?: number;
        protein?: number;
        carbs?: number;
        fat?: number;
      } = {};
      
      if (caloriesTarget.trim()) {
        const calories = parseInt(caloriesTarget.trim(), 10);
        if (!isNaN(calories) && calories > 0) {
          dailyMacroTargets.calories = calories;
        }
      }
      if (proteinTarget.trim()) {
        const protein = parseInt(proteinTarget.trim(), 10);
        if (!isNaN(protein) && protein > 0) {
          dailyMacroTargets.protein = protein;
        }
      }
      if (carbsTarget.trim()) {
        const carbs = parseInt(carbsTarget.trim(), 10);
        if (!isNaN(carbs) && carbs > 0) {
          dailyMacroTargets.carbs = carbs;
        }
      }
      if (fatTarget.trim()) {
        const fat = parseInt(fatTarget.trim(), 10);
        if (!isNaN(fat) && fat > 0) {
          dailyMacroTargets.fat = fat;
        }
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          timezone: timezone || 'America/New_York',
          cookingProficiency: cookingProficiency,
          defaultServingSize: defaultServingSize.trim() ? parseInt(defaultServingSize.trim(), 10) || undefined : undefined,
          dailyMacroTargets: Object.keys(dailyMacroTargets).length > 0 ? dailyMacroTargets : undefined,
          likes: allLikes,
          dislikes: allDislikes,
          allergens: allAllergens,
          restrictions: allRestrictions,
          preferredEquipment: allPreferredEquipment,
          unavailableEquipment: allUnavailableEquipment,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` };
        }
        throw new Error(errorData.error || `Failed to save profile: ${response.status}`);
      }

      Alert.alert('Success', 'Profile saved successfully!');
      router.back();
    } catch (error) {
      console.error('Failed to save profile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save profile. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const renderPillSection = (
    title: string,
    commonItems: string[],
    selected: string[],
    onToggle: (item: string) => void,
    customTags: string[],
    onCustomChange: (tags: string[]) => void,
    onToggleCustom: (item: string) => void
  ) => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.pillContainer}>
          {customTags.map(item => (
            <TouchableOpacity
              key={`custom-${item}`}
              style={[
                styles.pill,
                selected.includes(item) && styles.pillSelected,
              ]}
              onPress={() => onToggleCustom(item)}
            >
              <Text
                style={[
                  styles.pillText,
                  selected.includes(item) && styles.pillTextSelected,
                ]}
              >
                {item}
              </Text>
              {selected.includes(item) && (
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          ))}
          
          {commonItems.map(item => (
            <TouchableOpacity
              key={item}
              style={[
                styles.pill,
                selected.includes(item) && styles.pillSelected,
              ]}
              onPress={() => onToggle(item)}
            >
              <Text
                style={[
                  styles.pillText,
                  selected.includes(item) && styles.pillTextSelected,
                ]}
              >
                {item}
              </Text>
              {selected.includes(item) && (
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 4 }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.customLabel}>Add custom item:</Text>
        <TagInput 
          value={customTags} 
          onChange={(newTags) => {
            const removed = customTags.filter(t => !newTags.includes(t));
            const added = newTags.filter(t => !customTags.includes(t));
            
            onCustomChange(newTags);
            
            removed.forEach(tag => {
              if (selected.includes(tag)) {
                onToggle(tag);
              }
            });
            
            added.forEach(tag => {
              if (!selected.includes(tag)) {
                onToggle(tag);
              }
            });
          }}
          placeholder="Add custom item..." 
        />
      </View>
    );
  };

  const getSelectedTimezoneLabel = () => {
    const tz = ALL_TIMEZONES.find(t => t.value === timezone);
    return tz?.label || 'Select timezone';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Profile" showBackButton />
      
      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'info' && styles.tabActive]}
          onPress={() => setActiveTab('info')}
        >
          <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>
            Info
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'preferences' && styles.tabActive]}
          onPress={() => setActiveTab('preferences')}
        >
          <Text style={[styles.tabText, activeTab === 'preferences' && styles.tabTextActive]}>
            Preferences
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'macros' && styles.tabActive]}
          onPress={() => setActiveTab('macros')}
        >
          <Text style={[styles.tabText, activeTab === 'macros' && styles.tabTextActive]}>
            Macros
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {activeTab === 'info' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Display Name</Text>
              <Input
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter your display name"
                autoCapitalize="words"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Timezone (for Streaks)</Text>
              <Text style={styles.sectionDescription}>
                Your streak days are calculated based on this timezone
              </Text>
              <TouchableOpacity
                style={styles.timezoneButton}
                onPress={() => setTimezoneModalVisible(true)}
              >
                <Text style={styles.timezoneButtonText}>{getSelectedTimezoneLabel()}</Text>
                <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cooking Proficiency</Text>
              <Text style={styles.sectionDescription}>
                Help us tailor recipe suggestions to your skill level
              </Text>
              <CookingProficiencySlider
                value={cookingProficiency}
                onChange={setCookingProficiency}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Default Serving Size</Text>
              <Text style={styles.sectionDescription}>
                Your preferred default number of servings for recipes
              </Text>
              <Input
                value={defaultServingSize}
                onChangeText={setDefaultServingSize}
                placeholder="e.g., 4"
                keyboardType="numeric"
              />
            </View>
          </>
        )}

        {activeTab === 'preferences' && (
          <>
            {renderPillSection(
              'Likes',
              COMMON_LIKES,
              likes,
              (item) => toggleSelection(item, likes, setLikes),
              likesCustom,
              setLikesCustom,
              (item) => toggleSelection(item, likes, setLikes)
            )}

            {renderPillSection(
              'Dislikes',
              COMMON_DISLIKES,
              dislikes,
              (item) => toggleSelection(item, dislikes, setDislikes),
              dislikesCustom,
              setDislikesCustom,
              (item) => toggleSelection(item, dislikes, setDislikes)
            )}

            {renderPillSection(
              'Allergens',
              COMMON_ALLERGENS,
              allergens,
              (item) => toggleSelection(item, allergens, setAllergens),
              allergensCustom,
              setAllergensCustom,
              (item) => toggleSelection(item, allergens, setAllergens)
            )}

            {renderPillSection(
              'Restricted Foods',
              COMMON_RESTRICTIONS,
              restrictions,
              (item) => toggleSelection(item, restrictions, setRestrictions),
              restrictionsCustom,
              setRestrictionsCustom,
              (item) => toggleSelection(item, restrictions, setRestrictions)
            )}

            {renderPillSection(
              'Preferred Equipment',
              COMMON_EQUIPMENT,
              preferredEquipment,
              (item) => toggleSelection(item, preferredEquipment, setPreferredEquipment),
              preferredEquipmentCustom,
              setPreferredEquipmentCustom,
              (item) => toggleSelection(item, preferredEquipment, setPreferredEquipment)
            )}

            {renderPillSection(
              'Equipment I Don\'t Have',
              COMMON_EQUIPMENT,
              unavailableEquipment,
              (item) => toggleSelection(item, unavailableEquipment, setUnavailableEquipment),
              unavailableEquipmentCustom,
              setUnavailableEquipmentCustom,
              (item) => toggleSelection(item, unavailableEquipment, setUnavailableEquipment)
            )}
          </>
        )}

        {activeTab === 'macros' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Macro Targets</Text>
              <Text style={styles.sectionDescription}>
                Set your daily macro targets for tracking. These are optional and will be used to show progress on your dashboard.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.inputLabel}>Calories (kcal/day)</Text>
              <Input
                value={caloriesTarget}
                onChangeText={setCaloriesTarget}
                placeholder="e.g., 2000"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.inputLabel}>Protein (g/day)</Text>
              <Input
                value={proteinTarget}
                onChangeText={setProteinTarget}
                placeholder="e.g., 150"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.inputLabel}>Carbs (g/day)</Text>
              <Input
                value={carbsTarget}
                onChangeText={setCarbsTarget}
                placeholder="e.g., 200"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.inputLabel}>Fat (g/day)</Text>
              <Input
                value={fatTarget}
                onChangeText={setFatTarget}
                placeholder="e.g., 65"
                keyboardType="numeric"
              />
            </View>
          </>
        )}

        <Button
          title={saving ? 'Saving...' : 'Save Profile'}
          onPress={saveProfile}
          loading={saving}
          variant="primary"
          disabled={saving}
        />
      </ScrollView>

      <TimezonePickerModal
        visible={timezoneModalVisible}
        onClose={() => setTimezoneModalVisible(false)}
        selectedTimezone={timezone}
        onSelect={setTimezone}
      />
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    fontWeight: '700',
    color: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  timezoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timezoneButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
  },
  modalList: {
    flex: 1,
  },
  timezoneGroup: {
    marginBottom: 24,
  },
  timezoneGroupHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  timezoneModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingHorizontal: 20,
  },
  timezoneModalItemSelected: {
    backgroundColor: colors.background,
  },
  timezoneModalItemText: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  timezoneModalItemTextSelected: {
    fontWeight: '600',
    color: colors.primary,
  },
  timezoneModalItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timezoneModalItemOffset: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  timezoneModalItemOffsetSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  sliderContainer: {
    marginTop: 8,
  },
  sliderButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sliderButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sliderButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sliderButtonTextSelected: {
    color: colors.surface,
  },
  sliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  pillTextSelected: {
    color: colors.surface,
  },
  customLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
  },
  tagInputContainer: {
    marginTop: 8,
  },
  tagInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  tagInputField: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  addTagButton: {
    padding: 4,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tagText: {
    fontSize: 14,
    color: colors.accent,
    marginRight: 4,
  },
  kidFriendlyBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#FFF9E6', // Bright, cheerful yellow background
    borderWidth: 2,
    borderColor: '#FFD700', // Gold border for playful feel
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  kidFriendlyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  kidFriendlyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B9D', // Bright pink for playful text
    textAlign: 'center',
    lineHeight: 20,
  },
});
