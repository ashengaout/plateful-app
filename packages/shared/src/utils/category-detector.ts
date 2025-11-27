import type { PantryCategory } from '../types/pantry';
import { COMMON_INGREDIENTS } from '../constants/common-ingredients';

/**
 * Normalizes an ingredient name for matching.
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes extra spaces
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Detects the pantry category for an ingredient name by matching against COMMON_INGREDIENTS.
 * 
 * Matching logic:
 * - Exact match: Normalized names are identical
 * - Fuzzy match: One name contains the other (e.g., "chicken breast" contains "chicken")
 * 
 * @param ingredientName - The ingredient name to detect category for
 * @returns The detected pantry category, or 'other' if no match found
 */
export function detectPantryCategory(ingredientName: string): PantryCategory {
  if (!ingredientName || !ingredientName.trim()) {
    return 'other';
  }

  const normalizedInput = normalizeName(ingredientName);

  // Try exact match first
  for (const ingredient of COMMON_INGREDIENTS) {
    const normalizedIngredient = normalizeName(ingredient.name);
    if (normalizedInput === normalizedIngredient) {
      return ingredient.category;
    }
  }

  // Try fuzzy match (one contains the other)
  // Only consider matches if both are substantial (at least 4 characters)
  if (normalizedInput.length >= 4) {
    for (const ingredient of COMMON_INGREDIENTS) {
      const normalizedIngredient = normalizeName(ingredient.name);
      
      // Check if input contains ingredient name or vice versa
      // This handles cases like "chicken breast" matching "Chicken Breast"
      if (normalizedIngredient.length >= 4) {
        if (normalizedInput.includes(normalizedIngredient) || normalizedIngredient.includes(normalizedInput)) {
          return ingredient.category;
        }
      }
    }
  }

  // No match found, return 'other' as fallback
  return 'other';
}

