import type { RecipeData, FoodProfile } from '@plateful/shared';

/**
 * Detects equipment mentioned in recipe text
 * Returns array of equipment names found (case-insensitive matching)
 */
export function detectEquipmentInRecipe(
  recipeData: RecipeData
): string[] {
  const allText = [
    recipeData.title || '',
    recipeData.description || '',
    ...(recipeData.instructions || [])
  ].join(' ').toLowerCase();

  // Common equipment keywords to search for
  // This is a broader list than CAPACITY_LIMITED_EQUIPMENT
  const equipmentKeywords = [
    'instant pot', 'pressure cooker', 'slow cooker', 'crock-pot', 'rice cooker',
    'dutch oven', 'cast iron', 'stockpot', 'saucepan', 'soup pot',
    'skillet', 'frying pan', 'sauté pan', 'wok', 'grill pan', 'roasting pan',
    'stand mixer', 'hand mixer', 'food processor', 'blender', 'immersion blender',
    'baking sheet', 'baking dish', 'muffin tin', 'loaf pan', 'cake pan', 'pie dish',
    'air fryer', 'toaster oven', 'steamer',
    'grill', 'charcoal grill', 'gas grill', 'smoker', 'outdoor grill',
    'juicer', 'spiralizer', 'mandoline', 'pasta maker', 'bread maker',
    'meat thermometer', 'instant-read thermometer', 'kitchen scale', 'mortar and pestle',
    'tagine', 'paella pan', 'carbon steel pan', 'stainless steel pan',
  ];

  const foundEquipment: string[] = [];

  for (const keyword of equipmentKeywords) {
    if (allText.includes(keyword.toLowerCase())) {
      foundEquipment.push(keyword);
    }
  }

  return [...new Set(foundEquipment)]; // Remove duplicates
}

/**
 * Checks if recipe requires unavailable equipment (hard filter)
 */
export function requiresUnavailableEquipment(
  recipeData: RecipeData,
  profile: FoodProfile
): boolean {
  if (!profile.unavailableEquipment || profile.unavailableEquipment.length === 0) {
    return false;
  }

  const recipeEquipment = detectEquipmentInRecipe(recipeData);
  const unavailableLower = profile.unavailableEquipment.map(eq => eq.toLowerCase());

  // Check if any recipe equipment matches unavailable equipment (case-insensitive, partial matching)
  return recipeEquipment.some(eq => 
    unavailableLower.some(unavailable => 
      eq.toLowerCase().includes(unavailable) || unavailable.includes(eq.toLowerCase())
    )
  );
}

/**
 * Checks if recipe uses preferred equipment (soft preference)
 * Returns number of preferred equipment items found (for ranking)
 */
export function countPreferredEquipment(
  recipeData: RecipeData,
  profile: FoodProfile
): number {
  if (!profile.preferredEquipment || profile.preferredEquipment.length === 0) {
    return 0;
  }

  const recipeEquipment = detectEquipmentInRecipe(recipeData);
  const preferredLower = profile.preferredEquipment.map(eq => eq.toLowerCase());

  // Count how many preferred equipment items are found
  return recipeEquipment.filter(eq => 
    preferredLower.some(preferred => 
      eq.toLowerCase().includes(preferred) || preferred.includes(eq.toLowerCase())
    )
  ).length;
}


