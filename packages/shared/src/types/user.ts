export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  createdAt: Date;
}

export interface UserProfile extends User {
  preferences?: {
    notifications: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
}

export interface DailyMacroTargets {
  calories?: number;
  protein?: number; // grams
  carbs?: number; // grams
  fat?: number; // grams
}

export interface FoodProfile {
  id: string;
  userID: string;
  displayName?: string; // Display name stored in Cosmos DB
  timezone?: string; // Timezone for streak calculations (e.g., 'America/New_York'), defaults to Eastern Time
  cookingProficiency?: number; // Cooking skill level (1-5 scale), optional
  defaultServingSize?: number; // Default serving size for recipes (e.g., 4)
  dailyMacroTargets?: DailyMacroTargets; // Daily macro targets for tracking
  likes: string[];
  dislikes: string[];
  allergens: string[];
  restrictions: string[];
  preferredEquipment?: string[]; // Soft preference (prefer but not required)
  unavailableEquipment?: string[]; // Hard filter (exclude recipes requiring these)
  createdAt: string;
  updatedAt: string;
}