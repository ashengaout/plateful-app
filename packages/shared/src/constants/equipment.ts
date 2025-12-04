/**
 * Rare specialty cooking equipment that users can mark as unavailable.
 * Only includes very rare/specialty items that are NOT commonly found in kitchens.
 * This is intentionally a small list - only items that would significantly restrict recipe discovery.
 * Common items like Dutch oven, wok, blender, food processor are excluded as they're too common.
 */
export const SPECIALTY_EQUIPMENT = [
  // Very Rare Specialty Appliances
  'sous vide',
  'sous vide machine',
  'air fryer',
  'smoker',
  
  // Rare Small Appliances
  'stand mixer',
  'pasta maker',
  'bread maker',
  'juicer',
  'spiralizer',
  
  // Rare Specialty Cookware
  'tagine',
  'paella pan',
];

/**
 * @deprecated Use SPECIALTY_EQUIPMENT instead. Kept for backward compatibility.
 * This now only includes specialty items (same as SPECIALTY_EQUIPMENT).
 */
export const COMMON_EQUIPMENT = SPECIALTY_EQUIPMENT;

