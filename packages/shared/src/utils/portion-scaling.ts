import { parseIngredient } from './ingredient-parser';
import type { RecipeNutrition } from '../types/recipe';

/**
 * Extracts the number of portions from a portion string.
 * Examples: "4 servings" -> 4, "6" -> 6, "serves 8" -> 8
 */
export function extractPortionNumber(portions: string): number {
  if (!portions || typeof portions !== 'string') {
    return 4; // Default fallback
  }

  // Try to match numbers in the string
  const numberMatch = portions.match(/(\d+(?:\.\d+)?)/);
  if (numberMatch) {
    const num = parseFloat(numberMatch[1]);
    if (!isNaN(num) && num > 0) {
      return Math.round(num);
    }
  }

  return 4; // Default fallback
}

/**
 * Calculates the scale factor between original and target portions.
 */
export function calculateScaleFactor(originalPortions: number, targetPortions: number): number {
  if (originalPortions <= 0 || targetPortions <= 0) {
    return 1;
  }
  return targetPortions / originalPortions;
}

/**
 * Rounds a measurement value to a reasonable cooking measurement.
 * Different units have different rounding rules.
 */
export function roundToReasonableMeasurement(value: number, unit: string): number {
  if (value <= 0 || isNaN(value)) {
    return value;
  }

  const normalizedUnit = unit.toLowerCase().trim();

  // Small volume measurements (tsp, tbsp) - round to fractions
  if (normalizedUnit === 'tsp' || normalizedUnit === 'teaspoon' || normalizedUnit === 'teaspoons' ||
      normalizedUnit === 'tbsp' || normalizedUnit === 'tablespoon' || normalizedUnit === 'tablespoons') {
    return roundToFraction(value, [0.25, 0.33, 0.5, 0.67, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]);
  }

  // Medium volume (cups, fl oz) - round to 0.25 increments
  if (normalizedUnit === 'cups' || normalizedUnit === 'cup' ||
      normalizedUnit === 'fl oz' || normalizedUnit === 'fluid ounce' || normalizedUnit === 'fluid ounces') {
    return roundToIncrement(value, 0.25);
  }

  // Weight (g, oz, lb, kg) - round to 0.25 increments for small amounts, more precision for larger
  if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams' ||
      normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') {
    if (value < 10) {
      return roundToIncrement(value, 0.25);
    } else if (value < 100) {
      return roundToIncrement(value, 0.5);
    } else {
      return Math.round(value);
    }
  }

  if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds') {
    return roundToIncrement(value, 0.25);
  }

  if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
    if (value < 1) {
      return roundToIncrement(value, 0.1);
    } else {
      return roundToIncrement(value, 0.25);
    }
  }

  // Count items - handle differently based on whether they can be fractional
  if (isCountItem(normalizedUnit)) {
    if (isWholeOnlyItem(normalizedUnit)) {
      // Eggs and cloves must be whole numbers
      return Math.round(value);
    } else {
      // Container-like items (cans, boxes, bags, bunches, strips) can be fractional
      // Round to reasonable fractions (0.25, 0.33, 0.5, 0.67, 0.75) for values < 2
      // For larger values, round to 0.25 increments
      if (value < 2) {
        return roundToFraction(value, [0.25, 0.33, 0.5, 0.67, 0.75, 1.0, 1.25, 1.33, 1.5, 1.67, 1.75, 2.0]);
      } else {
        return roundToIncrement(value, 0.25);
      }
    }
  }

  // Length/measurement units (inch, knob) - round to 0.25 increments for small values
  if (normalizedUnit === 'inch' || normalizedUnit === 'inches' || normalizedUnit === 'in' ||
      normalizedUnit === 'knob' || normalizedUnit === 'knobs') {
    if (value < 2) {
      return roundToIncrement(value, 0.25);
    } else {
      return roundToIncrement(value, 0.5);
    }
  }

  // Volume (ml, l) - similar to weight
  if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters' ||
      normalizedUnit === 'millilitre' || normalizedUnit === 'millilitres') {
    if (value < 100) {
      return roundToIncrement(value, 5);
    } else {
      return Math.round(value);
    }
  }

  if (normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters' ||
      normalizedUnit === 'litre' || normalizedUnit === 'litres') {
    return roundToIncrement(value, 0.25);
  }

  // Default: round to 0.25 increments for small values, whole numbers for larger
  if (value < 1) {
    return roundToIncrement(value, 0.25);
  } else {
    return Math.round(value);
  }
}

/**
 * Rounds a value to the nearest value in a list of preferred values.
 */
function roundToFraction(value: number, preferredValues: number[]): number {
  let closest = preferredValues[0];
  let minDiff = Math.abs(value - closest);

  for (const pref of preferredValues) {
    const diff = Math.abs(value - pref);
    if (diff < minDiff) {
      minDiff = diff;
      closest = pref;
    }
  }

  return closest;
}

/**
 * Rounds a value to the nearest increment.
 */
function roundToIncrement(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

/**
 * Formats a number as a fraction string (e.g., 0.5 -> "1/2", 0.33 -> "1/3").
 */
function formatAsFraction(value: number): string {
  const tolerance = 0.01;
  const fractions: Array<[number, string]> = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.33, '1/3'],
    [0.5, '1/2'],
    [0.67, '2/3'],
    [0.75, '3/4'],
  ];

  for (const [decimal, fraction] of fractions) {
    if (Math.abs(value - decimal) < tolerance) {
      return fraction;
    }
  }

  // Check for whole numbers with fractions
  const whole = Math.floor(value);
  const remainder = value - whole;
  if (whole > 0 && remainder > tolerance) {
    for (const [decimal, fraction] of fractions) {
      if (Math.abs(remainder - decimal) < tolerance) {
        return `${whole} ${fraction}`;
      }
    }
  }

  // Check for just whole numbers
  if (Math.abs(value - Math.round(value)) < tolerance) {
    return Math.round(value).toString();
  }

  return value.toString();
}

/**
 * Checks if a unit is a count item (discrete items that can be counted).
 */
function isCountItem(unit: string): boolean {
  const normalizedUnit = unit.toLowerCase().trim();
  return normalizedUnit === 'pieces' || normalizedUnit === 'piece' ||
         normalizedUnit === 'cloves' || normalizedUnit === 'clove' ||
         normalizedUnit === 'eggs' || normalizedUnit === 'egg' ||
         normalizedUnit === 'strips' || normalizedUnit === 'strip' ||
         normalizedUnit === 'boxes' || normalizedUnit === 'box' ||
         normalizedUnit === 'cans' || normalizedUnit === 'can' ||
         normalizedUnit === 'bunches' || normalizedUnit === 'bunch';
}

/**
 * Checks if a unit must always be a whole number (can't be fractional).
 * Items like eggs and cloves must be whole, but cans/boxes/bags can be fractional.
 */
function isWholeOnlyItem(unit: string): boolean {
  const normalizedUnit = unit.toLowerCase().trim();
  // Only eggs and cloves must be whole numbers
  return normalizedUnit === 'eggs' || normalizedUnit === 'egg' ||
         normalizedUnit === 'cloves' || normalizedUnit === 'clove';
}

/**
 * Filters out notes that contain quantity references (e.g., "from about 2 large lemons").
 * These notes don't make sense when scaling, so we remove them.
 */
function filterQuantityReferencesFromNotes(notes: string): string {
  if (!notes) return notes;
  
  // Split notes by comma and filter out parts that contain quantity references
  const noteParts = notes.split(',').map(part => part.trim()).filter(part => {
    if (!part) return false;
    
    // Check for patterns that indicate quantity references:
    // - "from about X" or "from X"
    // - "about X" followed by a noun
    // - "X large/small/medium" followed by a noun
    // - Numbers followed by descriptive words that suggest quantities
    
    const lowerPart = part.toLowerCase();
    
    // Remove parts with "from about" or "from" followed by a number
    if (/from\s+(about\s+)?\d+/.test(lowerPart)) {
      return false;
    }
    
    // Remove parts with "about" followed by a number and a noun
    if (/about\s+\d+\s+\w+/.test(lowerPart)) {
      return false;
    }
    
    // Remove parts with numbers followed by size descriptors and nouns (e.g., "2 large lemons")
    if (/\d+\s+(large|small|medium|extra\s+large)\s+\w+/.test(lowerPart)) {
      return false;
    }
    
    // Keep other notes (preparation instructions, etc.)
    return true;
  });
  
  return noteParts.join(', ');
}

/**
 * Converts volume units to smaller units when quantity gets too small for practical measurement.
 * - Cups < 1/4 cup → convert to tablespoons
 * - Tablespoons < 1 tbsp → convert to teaspoons
 * Handles cascading conversions (cups → tbsp → tsp if needed).
 * Returns the converted quantity and unit, or original if no conversion needed.
 */
function convertToSmallerVolumeUnit(quantity: number, unit: string): { quantity: number; unit: string } {
  let currentQuantity = quantity;
  let currentUnit = unit.toLowerCase().trim();
  
  // Keep converting until we reach an appropriate unit or can't convert further
  let converted = true;
  while (converted) {
    converted = false;
    
    // Convert cups to tablespoons if < 1/4 cup (0.25)
    // 1 cup = 16 tablespoons
    if ((currentUnit === 'cups' || currentUnit === 'cup') && currentQuantity > 0 && currentQuantity < 0.25) {
      currentQuantity = currentQuantity * 16;
      currentUnit = 'tbsp';
      converted = true;
      continue;
    }
    
    // Convert tablespoons to teaspoons if < 1 tbsp
    // 1 tablespoon = 3 teaspoons
    if ((currentUnit === 'tbsp' || currentUnit === 'tablespoon' || currentUnit === 'tablespoons') && 
        currentQuantity > 0 && currentQuantity < 1.0) {
      currentQuantity = currentQuantity * 3;
      currentUnit = 'tsp';
      converted = true;
      continue;
    }
  }
  
  return { quantity: currentQuantity, unit: currentUnit };
}

/**
 * Returns the correct singular or plural form of a unit based on quantity.
 * Handles both abbreviated units (tbsp, oz, etc.) and full-word units (cups, cans, etc.).
 */
function getUnitForm(quantity: number, unit: string): string {
  if (!unit) return '';
  
  const normalizedUnit = unit.toLowerCase().trim();
  const qty = Math.abs(quantity);
  
  // Abbreviated units (tbsp, tsp, oz, lb, g, kg, ml, l) don't change with singular/plural
  // Return them as-is
  if (normalizedUnit === 'tbsp' || normalizedUnit === 'tsp' || 
      normalizedUnit === 'oz' || normalizedUnit === 'lb' || 
      normalizedUnit === 'g' || normalizedUnit === 'kg' || 
      normalizedUnit === 'ml' || normalizedUnit === 'l' ||
      normalizedUnit === 'fl oz') {
    return normalizedUnit;
  }
  
  // For count === 1, use singular; otherwise use plural
  if (qty === 1) {
    // Return singular form for full-word units
    if (normalizedUnit === 'tablespoons') return 'tablespoon';
    if (normalizedUnit === 'teaspoons') return 'teaspoon';
    if (normalizedUnit === 'cups' || normalizedUnit === 'cup') return 'cup';
    if (normalizedUnit === 'ounces') return 'ounce';
    if (normalizedUnit === 'pounds') return 'pound';
    if (normalizedUnit === 'grams') return 'gram';
    if (normalizedUnit === 'kilograms') return 'kilogram';
    if (normalizedUnit === 'milliliters' || normalizedUnit === 'millilitres') return 'milliliter';
    if (normalizedUnit === 'liters' || normalizedUnit === 'litres') return 'liter';
    if (normalizedUnit === 'pieces' || normalizedUnit === 'piece') return 'piece';
    if (normalizedUnit === 'cloves' || normalizedUnit === 'clove') return 'clove';
    if (normalizedUnit === 'eggs' || normalizedUnit === 'egg') return 'egg';
    if (normalizedUnit === 'strips' || normalizedUnit === 'strip') return 'strip';
    if (normalizedUnit === 'boxes' || normalizedUnit === 'box') return 'box';
    if (normalizedUnit === 'cans' || normalizedUnit === 'can') return 'can';
    if (normalizedUnit === 'bunches' || normalizedUnit === 'bunch') return 'bunch';
    if (normalizedUnit === 'fluid ounces') return 'fluid ounce';
    if (normalizedUnit === 'inches' || normalizedUnit === 'in' || normalizedUnit === 'inch') return 'inch';
    if (normalizedUnit === 'knobs' || normalizedUnit === 'knob') return 'knob';
  } else {
    // For quantity !== 1, return plural form
    if (normalizedUnit === 'tablespoon') return 'tablespoons';
    if (normalizedUnit === 'teaspoon') return 'teaspoons';
    if (normalizedUnit === 'cup') return 'cups';
    if (normalizedUnit === 'ounce') return 'ounces';
    if (normalizedUnit === 'pound') return 'pounds';
    if (normalizedUnit === 'gram') return 'grams';
    if (normalizedUnit === 'kilogram') return 'kilograms';
    if (normalizedUnit === 'milliliter' || normalizedUnit === 'millilitre') return 'milliliters';
    if (normalizedUnit === 'liter' || normalizedUnit === 'litre') return 'liters';
    if (normalizedUnit === 'piece') return 'pieces';
    if (normalizedUnit === 'clove') return 'cloves';
    if (normalizedUnit === 'egg') return 'eggs';
    if (normalizedUnit === 'strip') return 'strips';
    if (normalizedUnit === 'box') return 'boxes';
    if (normalizedUnit === 'can') return 'cans';
    if (normalizedUnit === 'bunch') return 'bunches';
    if (normalizedUnit === 'fluid ounce') return 'fluid ounces';
    if (normalizedUnit === 'inch') return 'inches';
    if (normalizedUnit === 'knob') return 'knobs';
  }
  
  // Return original if no conversion needed (already in correct form or unknown unit)
  return normalizedUnit;
}

/**
 * Formats a scaled quantity for display.
 */
function formatQuantity(quantity: number, unit: string): string {
  const normalizedUnit = unit.toLowerCase().trim();

  // For tsp/tbsp, prefer fractions for small values
  if (normalizedUnit === 'tsp' || normalizedUnit === 'teaspoon' || normalizedUnit === 'teaspoons' ||
      normalizedUnit === 'tbsp' || normalizedUnit === 'tablespoon' || normalizedUnit === 'tablespoons') {
    if (quantity < 3) {
      return formatAsFraction(quantity);
    }
  }

  // For cups, prefer fractions for values less than 2
  if (normalizedUnit === 'cups' || normalizedUnit === 'cup') {
    if (quantity < 2) {
      return formatAsFraction(quantity);
    }
  }

  // For weight units (pounds, ounces), prefer fractions for small values
  if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds' ||
      normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') {
    if (quantity < 2) {
      return formatAsFraction(quantity);
    }
  }

  // For container-like count items (cans, boxes, bags, bunches, strips), use fractions for better readability
  if (isCountItem(normalizedUnit) && !isWholeOnlyItem(normalizedUnit)) {
    // Use fractions for values less than 3, otherwise show decimals
    if (quantity < 3) {
      return formatAsFraction(quantity);
    }
  }

  // For whole numbers, just return the number
  if (Math.abs(quantity - Math.round(quantity)) < 0.01) {
    return Math.round(quantity).toString();
  }

  // For decimals, show up to 2 decimal places, removing trailing zeros
  return quantity.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Scales an ingredient string based on portion changes.
 */
export function scaleIngredient(
  ingredient: string,
  originalPortions: number,
  targetPortions: number
): string {
  if (!ingredient || originalPortions <= 0 || targetPortions <= 0) {
    return ingredient;
  }

  // If portions are the same, return original
  if (originalPortions === targetPortions) {
    return ingredient;
  }

  // Parse the ingredient
  const parsed = parseIngredient(ingredient);

  // Check if this is a descriptive ingredient without explicit quantity/unit
  // Descriptive ingredients like "Rice noodles", "Shrimp", "Eggs" should not be scaled
  const isDescriptiveIngredient = !parsed.unit && 
                                   parsed.quantity === 1 && 
                                   ingredient.trim().toLowerCase() === parsed.name.toLowerCase().trim();
  
  if (isDescriptiveIngredient) {
    // This is a descriptive ingredient without explicit quantity - don't scale it
    return ingredient;
  }

  // If we couldn't parse a quantity (still 1 with no unit), check if we should scale it
  // For non-standard units or count items without units, we can still scale the quantity
  if (parsed.quantity === 1 && !parsed.unit && ingredient.trim() !== parsed.name) {
    // Check if the name starts with a number - if so, we should try to scale it
    const nameStartsWithNumber = /^\d+/.test(parsed.name.trim());
    if (!nameStartsWithNumber) {
      // No number in name, might be a descriptive ingredient - preserve original
      return ingredient;
    }
    // If name has a number, we'll proceed with scaling (the number will be scaled)
  }

  // Calculate scale factor
  const scaleFactor = calculateScaleFactor(originalPortions, targetPortions);
  
  // Only scale if we have a valid parsed quantity AND a unit
  // Items without units should not be scaled to avoid "0.75 shrimp" type results
  if (!parsed.quantity || isNaN(parsed.quantity) || parsed.quantity <= 0) {
    // Can't scale invalid quantity, return original
    return ingredient;
  }

  // If there's no unit and the quantity is the default (1), don't scale
  // This prevents scaling descriptive ingredients that were parsed with default quantity=1
  if (!parsed.unit && parsed.quantity === 1) {
    // Check if the original ingredient string actually had a number
    const hasNumberInOriginal = /\d/.test(ingredient);
    if (!hasNumberInOriginal) {
      // No number in original, this is a descriptive ingredient - don't scale
      return ingredient;
    }
  }
  
  // Scale the quantity
  const scaledQuantity = parsed.quantity * scaleFactor;
  
  // Convert to smaller volume units BEFORE rounding to catch cases like 1/8 cup (0.125)
  // This makes measurements more practical (e.g., "2 tbsp" instead of "1/8 cup")
  // Check the original scaled quantity to determine if conversion is needed
  const convertedBeforeRounding = convertToSmallerVolumeUnit(scaledQuantity, parsed.unit);
  let roundedQuantity: number;
  let finalUnit: string;
  
  // If conversion happened, round the converted quantity; otherwise round the original
  if (convertedBeforeRounding.unit !== parsed.unit) {
    // Conversion happened - round the converted quantity
    roundedQuantity = roundToReasonableMeasurement(convertedBeforeRounding.quantity, convertedBeforeRounding.unit);
    finalUnit = convertedBeforeRounding.unit;
  } else {
    // No conversion needed - round the original scaled quantity
    roundedQuantity = roundToReasonableMeasurement(scaledQuantity, parsed.unit);
    finalUnit = parsed.unit;
    
    // After rounding, check again if conversion is now needed (e.g., 0.125 rounded to 0.25, but we still want to convert)
    // This handles edge cases where rounding changes the value
    const convertedAfterRounding = convertToSmallerVolumeUnit(roundedQuantity, finalUnit);
    if (convertedAfterRounding.unit !== finalUnit) {
      roundedQuantity = roundToReasonableMeasurement(convertedAfterRounding.quantity, convertedAfterRounding.unit);
      finalUnit = convertedAfterRounding.unit;
    }
  }
  
  // Enforce minimum quantities when scaling DOWN to prevent "0 cups", "0 cans", etc.
  // This prevents nonsensical zero quantities when scaling down, but allows proper scaling up
  const isScalingDown = scaleFactor < 1;
  const normalizedUnit = finalUnit.toLowerCase().trim();
  
  // Check if we need to enforce minimums (either zero or very small values for teaspoons)
  const needsMinimumEnforcement = isScalingDown && parsed.quantity > 0 && 
    (roundedQuantity <= 0 || (normalizedUnit === 'tsp' && roundedQuantity < 0.25));
  
  if (needsMinimumEnforcement) {
    // Determine appropriate minimum based on unit type
    if (isCountItem(normalizedUnit)) {
      // For whole-only items (eggs, cloves), enforce minimum of 1
      if (isWholeOnlyItem(normalizedUnit)) {
        roundedQuantity = 1;
      } else {
        // For container-like items, allow small fractions but enforce minimum of 0.25
        roundedQuantity = 0.25;
      }
    } else if (normalizedUnit === 'cups' || normalizedUnit === 'cup' ||
               normalizedUnit === 'fl oz' || normalizedUnit === 'fluid ounce' || normalizedUnit === 'fluid ounces') {
      // For volume units (cups, fl oz), convert to smaller unit instead of enforcing minimum
      // This should have been handled by convertToSmallerVolumeUnit, but as fallback use 1/8
      roundedQuantity = 0.125;
    } else if (normalizedUnit === 'tsp' || normalizedUnit === 'teaspoon' || normalizedUnit === 'teaspoons') {
      // For teaspoons, allow scaling down but enforce minimum of 1/4 tsp (0.25)
      // This ensures we don't go below a practical measurement
      if (roundedQuantity < 0.25) {
        roundedQuantity = 0.25;
      }
    } else if (normalizedUnit === 'tbsp' || normalizedUnit === 'tablespoon' || normalizedUnit === 'tablespoons') {
      // For tablespoons, convert to teaspoons if < 1 tbsp (handled above), but as fallback use 1/8
      roundedQuantity = 0.125;
    } else if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound' || normalizedUnit === 'pounds' ||
               normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') {
      // For weight units (pounds, ounces), enforce minimum of 1/8 (0.125)
      roundedQuantity = 0.125;
    } else if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams' ||
               normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
      // For metric weight units, enforce minimum of 1g or 0.01kg
      if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') {
        roundedQuantity = 0.01;
      } else {
        roundedQuantity = 1;
      }
    } else if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters' ||
               normalizedUnit === 'millilitre' || normalizedUnit === 'millilitres' ||
               normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters' ||
               normalizedUnit === 'litre' || normalizedUnit === 'litres') {
      // For metric volume units, enforce minimum of 1ml or 0.01l
      if (normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters' ||
          normalizedUnit === 'litre' || normalizedUnit === 'litres') {
        roundedQuantity = 0.01;
      } else {
        roundedQuantity = 1;
      }
    } else if (roundedQuantity <= 0) {
      // For any other unit, enforce minimum of 0.125 (1/8) as a reasonable default
      roundedQuantity = 0.125;
    }
  }

  // Format the quantity
  const formattedQuantity = formatQuantity(roundedQuantity, finalUnit);
  
  // Get the correct singular/plural form of the unit
  // Special case: if unit is "inch" and name contains "knob", "inch" is a descriptor (stays singular)
  // e.g., "1 inch knob" → "2 inch knobs" (not "2 inches knobs")
  let unitForm = getUnitForm(roundedQuantity, finalUnit);
  const normalizedFinalUnit = finalUnit.toLowerCase().trim();
  const normalizedName = parsed.name.toLowerCase().trim();
  
  if (normalizedFinalUnit === 'inch' || normalizedFinalUnit === 'inches') {
    // Check if "inch" is being used as a descriptor (followed by a noun like "knob")
    if (normalizedName.includes('knob') || normalizedName.startsWith('knob')) {
      // "Inch" is a descriptor, keep it singular
      unitForm = 'inch';
    }
  }

  // Reconstruct the ingredient string
  let result = '';
  
  // Always include quantity if we have one (even if it's "1") or if there's a unit
  if (formattedQuantity || unitForm) {
    if (formattedQuantity) {
      result = `${formattedQuantity}${unitForm ? ` ${unitForm}` : ''}`;
    } else if (unitForm) {
      // Unit without quantity - use "1" as default
      result = `1 ${unitForm}`;
    }
  }
  
  // Add ingredient name
  if (parsed.name) {
    let ingredientName = parsed.name;
    
    // Special case: if we have "inch knob" and quantity > 1, pluralize "knob"
    // e.g., "1 inch knob" → "2 inch knobs"
    if (normalizedFinalUnit === 'inch' || normalizedFinalUnit === 'inches') {
      if (normalizedName.includes('knob')) {
        if (roundedQuantity !== 1) {
          // Pluralize "knob" to "knobs"
          ingredientName = ingredientName.replace(/\bknob\b/gi, 'knobs');
        }
      }
    }
    
    result = result ? `${result} ${ingredientName}` : ingredientName;
  }
  
  // Add notes with proper comma placement, but filter out quantity references
  if (parsed.notes) {
    const filteredNotes = filterQuantityReferencesFromNotes(parsed.notes);
    if (filteredNotes) {
      // Only add comma if we have a result before the notes
      if (result) {
        result = `${result}, ${filteredNotes}`;
      } else {
        result = filteredNotes;
      }
    }
  }

  return result.trim() || ingredient; // Fallback to original if result is empty
}

/**
 * Parses a nutrition value string (e.g., "38g" -> 38).
 */
function parseNutritionValue(value: string): number {
  if (!value || typeof value !== 'string') {
    return 0;
  }
  
  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }
  
  return 0;
}

/**
 * Formats a nutrition value back to string (e.g., 38 -> "38g").
 */
function formatNutritionValue(value: number, originalString: string): string {
  // Extract unit from original string if present
  const unitMatch = originalString.match(/\d+(?:\.\d+)?\s*(\w+)/);
  const unit = unitMatch ? unitMatch[1] : '';
  
  // Round appropriately
  const rounded = Math.round(value * 10) / 10;
  
  if (unit) {
    return `${rounded}${unit}`;
  }
  
  return rounded.toString();
}

/**
 * Scales nutrition values based on scale factor.
 * Note: calories_per_portion stays the same (it's per portion).
 * Other values (protein, carbs, fat) are scaled - assuming they represent totals or per portion.
 */
export function scaleNutrition(
  nutrition: RecipeNutrition,
  scaleFactor: number
): RecipeNutrition {
  if (scaleFactor === 1) {
    return nutrition;
  }

  const scaled: RecipeNutrition = {
    calories_per_portion: nutrition.calories_per_portion, // Per portion stays the same
  };

  // Scale other nutrition values - assuming they represent per portion values
  // User sees scaled total nutrition when portions are adjusted
  if (nutrition.protein) {
    const value = parseNutritionValue(nutrition.protein) * scaleFactor;
    scaled.protein = formatNutritionValue(value, nutrition.protein);
  }

  if (nutrition.carbs) {
    const value = parseNutritionValue(nutrition.carbs) * scaleFactor;
    scaled.carbs = formatNutritionValue(value, nutrition.carbs);
  }

  if (nutrition.fat) {
    const value = parseNutritionValue(nutrition.fat) * scaleFactor;
    scaled.fat = formatNutritionValue(value, nutrition.fat);
  }

  return scaled;
}

