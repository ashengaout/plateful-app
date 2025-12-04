import type { RecipeData, FoodProfile } from '@plateful/shared';
import { SPECIALTY_EQUIPMENT } from '@plateful/shared';

/**
 * Detects specialty equipment mentioned in recipe text
 * Only detects specialty items (not common items like skillet, saucepan, etc.)
 * Only checks instructions to avoid false positives from titles/descriptions
 * Returns array of equipment names found (case-insensitive matching)
 */
export function detectEquipmentInRecipe(
  recipeData: RecipeData
): string[] {
  // Only check instructions - equipment mentioned in title/description might not be required
  // This makes filtering less restrictive and only filters when equipment is actually used
  const instructionsText = (recipeData.instructions || []).join(' ').toLowerCase();
  
  if (!instructionsText) {
    return []; // No instructions, can't detect equipment
  }

  // Only search for specialty equipment keywords
  // Common items like skillet, saucepan, baking sheet are excluded
  const equipmentKeywords = SPECIALTY_EQUIPMENT.map(eq => eq.toLowerCase());

  const foundEquipment: string[] = [];

  for (const keyword of equipmentKeywords) {
    if (instructionsText.includes(keyword.toLowerCase())) {
      // Find the original casing from SPECIALTY_EQUIPMENT
      const originalEquipment = SPECIALTY_EQUIPMENT.find(eq => eq.toLowerCase() === keyword.toLowerCase());
      if (originalEquipment) {
        foundEquipment.push(originalEquipment);
      }
    }
  }

  // Also check for sous vide variations
  if (instructionsText.includes('sous vide') || instructionsText.includes('sous-vide')) {
    if (!foundEquipment.some(eq => eq.toLowerCase().includes('sous vide'))) {
      foundEquipment.push('sous vide');
    }
  }

  return [...new Set(foundEquipment)]; // Remove duplicates
}

/**
 * Checks if recipe requires unavailable equipment (hard filter)
 * Uses strict matching - only filters if equipment is explicitly required/mentioned
 * This is intentionally less restrictive to avoid filtering out recipes unnecessarily
 */
export function requiresUnavailableEquipment(
  recipeData: RecipeData,
  profile: FoodProfile
): boolean {
  if (!profile.unavailableEquipment || profile.unavailableEquipment.length === 0) {
    return false;
  }

  const recipeEquipment = detectEquipmentInRecipe(recipeData);
  if (recipeEquipment.length === 0) {
    return false; // No specialty equipment detected, don't filter
  }

  const unavailableLower = profile.unavailableEquipment.map(eq => eq.toLowerCase());

  // Use strict matching - equipment must be explicitly mentioned
  // Only filter if there's a clear match (not just partial/substring matches)
  return recipeEquipment.some(eq => {
    const eqLower = eq.toLowerCase();
    return unavailableLower.some(unavailableLowercase => {
      // Require exact match or equipment name contains the unavailable item
      // This prevents false positives (e.g., "stand mixer" matching "mixer" when user only marked "stand mixer" as unavailable)
      return eqLower === unavailableLowercase || 
             eqLower.includes(unavailableLowercase) ||
             unavailableLowercase.includes(eqLower);
    });
  });
}

/**
 * @deprecated Preferred equipment has been removed. This function always returns 0.
 * Kept for backward compatibility but no longer used.
 */
export function countPreferredEquipment(
  recipeData: RecipeData,
  profile: FoodProfile
): number {
  // Preferred equipment feature has been removed
  return 0;
}




