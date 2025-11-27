import type { CommonIngredient, PantryCategory } from '../types/pantry';

/**
 * Curated list of common ingredients grouped by category.
 * 
 * Items with requiresQuantity: true should prompt for quantity when adding.
 * Items with requiresQuantity: false are just marked as "in pantry" without quantity.
 */
export const COMMON_INGREDIENTS: CommonIngredient[] = [
  // Produce
  { name: 'Apples', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Bananas', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Onions', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Garlic', category: 'produce', requiresQuantity: false },
  { name: 'Potatoes', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Carrots', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Tomatoes', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Lettuce', category: 'produce', requiresQuantity: false },
  { name: 'Spinach', category: 'produce', requiresQuantity: false },
  { name: 'Bell Peppers', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Mushrooms', category: 'produce', requiresQuantity: false },
  { name: 'Avocados', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Lemons', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Limes', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Broccoli', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Cauliflower', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Celery', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'bunch'] },
  { name: 'Cucumber', category: 'produce', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Zucchini', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Squash', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Corn', category: 'produce', requiresQuantity: true, commonUnits: ['ears', 'pieces'] },
  { name: 'Green Beans', category: 'produce', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Peas', category: 'produce', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Asparagus', category: 'produce', requiresQuantity: true, commonUnits: ['bunch', 'lb'] },
  { name: 'Brussels Sprouts', category: 'produce', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Cabbage', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Kale', category: 'produce', requiresQuantity: false },
  { name: 'Arugula', category: 'produce', requiresQuantity: false },
  { name: 'Radishes', category: 'produce', requiresQuantity: true, commonUnits: ['bunch', 'pieces'] },
  { name: 'Beets', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Sweet Potatoes', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Ginger', category: 'produce', requiresQuantity: false },
  { name: 'Cilantro', category: 'produce', requiresQuantity: false },
  { name: 'Parsley', category: 'produce', requiresQuantity: false },
  { name: 'Green Onions', category: 'produce', requiresQuantity: true, commonUnits: ['bunch'] },
  { name: 'Oranges', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Grapes', category: 'produce', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Strawberries', category: 'produce', requiresQuantity: true, commonUnits: ['lb', 'pints'] },
  { name: 'Blueberries', category: 'produce', requiresQuantity: true, commonUnits: ['lb', 'pints'] },
  { name: 'Raspberries', category: 'produce', requiresQuantity: true, commonUnits: ['pints', 'oz'] },
  { name: 'Peaches', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },
  { name: 'Pears', category: 'produce', requiresQuantity: true, commonUnits: ['pieces', 'lb'] },

  // Dairy
  { name: 'Eggs', category: 'dairy', requiresQuantity: true, commonUnits: ['eggs'] },
  { name: 'Milk', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'gal', 'oz'] },
  { name: 'Butter', category: 'dairy', requiresQuantity: true, commonUnits: ['sticks', 'tbsp', 'oz'] },
  { name: 'Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['oz', 'lb', 'cups'] },
  { name: 'Yogurt', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Sour Cream', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Heavy Cream', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Cream Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['oz'] },
  { name: 'Cottage Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Ricotta Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Mozzarella', category: 'dairy', requiresQuantity: true, commonUnits: ['oz', 'lb'] },
  { name: 'Cheddar Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['oz', 'lb'] },
  { name: 'Parmesan', category: 'dairy', requiresQuantity: true, commonUnits: ['oz', 'cups'] },
  { name: 'Feta Cheese', category: 'dairy', requiresQuantity: true, commonUnits: ['oz'] },
  { name: 'Half & Half', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Buttermilk', category: 'dairy', requiresQuantity: true, commonUnits: ['cups', 'oz'] },

  // Meat & Seafood
  { name: 'Chicken Breast', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Ground Beef', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Bacon', category: 'meat', requiresQuantity: true, commonUnits: ['strips', 'oz', 'lb'] },
  { name: 'Salmon', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Shrimp', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Turkey', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Chicken Thighs', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Chicken Wings', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Ground Turkey', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Ground Chicken', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Pork Chops', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Pork Tenderloin', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },
  { name: 'Sausage', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'links'] },
  { name: 'Ham', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Tuna', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'oz', 'cans'] },
  { name: 'Cod', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Tilapia', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Crab', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Scallops', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'oz'] },
  { name: 'Beef Steak', category: 'meat', requiresQuantity: true, commonUnits: ['lb', 'pieces'] },
  { name: 'Ground Pork', category: 'meat', requiresQuantity: true, commonUnits: ['lb'] },

  // Bakery
  { name: 'Bread', category: 'bakery', requiresQuantity: false },
  { name: 'Tortillas', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Bagels', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'English Muffins', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Croissants', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Dinner Rolls', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Hamburger Buns', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Hot Dog Buns', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Pita Bread', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Naan', category: 'bakery', requiresQuantity: true, commonUnits: ['pieces'] },

  // Pantry Staples
  { name: 'Flour', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Sugar', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Brown Sugar', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Rice', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Pasta', category: 'pantry', requiresQuantity: true, commonUnits: ['oz', 'lb', 'boxes'] },
  { name: 'Olive Oil', category: 'pantry', requiresQuantity: false },
  { name: 'Vegetable Oil', category: 'pantry', requiresQuantity: false },
  { name: 'Chicken Broth', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'cans'] },
  { name: 'Beef Broth', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'cans'] },
  { name: 'Canned Tomatoes', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Black Beans', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Kidney Beans', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Chickpeas', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Baking Powder', category: 'pantry', requiresQuantity: true, commonUnits: ['tsp', 'tbsp'] },
  { name: 'Baking Soda', category: 'pantry', requiresQuantity: true, commonUnits: ['tsp', 'tbsp'] },
  { name: 'Vanilla Extract', category: 'pantry', requiresQuantity: false },
  { name: 'Cornstarch', category: 'pantry', requiresQuantity: true, commonUnits: ['tbsp', 'oz'] },
  { name: 'Cocoa Powder', category: 'pantry', requiresQuantity: true, commonUnits: ['tbsp', 'oz'] },
  { name: 'Oats', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Quinoa', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Barley', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Lentils', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Split Peas', category: 'pantry', requiresQuantity: true, commonUnits: ['cups', 'lb'] },
  { name: 'Coconut Oil', category: 'pantry', requiresQuantity: false },
  { name: 'Sesame Oil', category: 'pantry', requiresQuantity: false },
  { name: 'Vinegar', category: 'pantry', requiresQuantity: false },
  { name: 'White Vinegar', category: 'pantry', requiresQuantity: false },
  { name: 'Apple Cider Vinegar', category: 'pantry', requiresQuantity: false },
  { name: 'Canned Corn', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Canned Green Beans', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Canned Peas', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Pinto Beans', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'White Beans', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Tomato Paste', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz', 'tbsp'] },
  { name: 'Tomato Sauce', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Crushed Tomatoes', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Diced Tomatoes', category: 'pantry', requiresQuantity: true, commonUnits: ['cans', 'oz'] },
  { name: 'Peanut Butter', category: 'pantry', requiresQuantity: false },
  { name: 'Almond Butter', category: 'pantry', requiresQuantity: false },
  { name: 'Jelly', category: 'pantry', requiresQuantity: false },
  { name: 'Jam', category: 'pantry', requiresQuantity: false },
  { name: 'Maple Syrup', category: 'pantry', requiresQuantity: false },
  { name: 'Molasses', category: 'pantry', requiresQuantity: false },

  // Spices & Seasonings (typically don't need quantities)
  { name: 'Salt', category: 'spices', requiresQuantity: false },
  { name: 'Black Pepper', category: 'spices', requiresQuantity: false },
  { name: 'Garlic Powder', category: 'spices', requiresQuantity: false },
  { name: 'Onion Powder', category: 'spices', requiresQuantity: false },
  { name: 'Paprika', category: 'spices', requiresQuantity: false },
  { name: 'Cumin', category: 'spices', requiresQuantity: false },
  { name: 'Oregano', category: 'spices', requiresQuantity: false },
  { name: 'Basil', category: 'spices', requiresQuantity: false },
  { name: 'Thyme', category: 'spices', requiresQuantity: false },
  { name: 'Rosemary', category: 'spices', requiresQuantity: false },
  { name: 'Cinnamon', category: 'spices', requiresQuantity: false },
  { name: 'Chili Powder', category: 'spices', requiresQuantity: false },
  { name: 'Bay Leaves', category: 'spices', requiresQuantity: false },
  { name: 'Red Pepper Flakes', category: 'spices', requiresQuantity: false },
  { name: 'Cayenne Pepper', category: 'spices', requiresQuantity: false },
  { name: 'Curry Powder', category: 'spices', requiresQuantity: false },
  { name: 'Turmeric', category: 'spices', requiresQuantity: false },
  { name: 'Ginger Powder', category: 'spices', requiresQuantity: false },
  { name: 'Nutmeg', category: 'spices', requiresQuantity: false },
  { name: 'Allspice', category: 'spices', requiresQuantity: false },
  { name: 'Cloves', category: 'spices', requiresQuantity: false },
  { name: 'Cardamom', category: 'spices', requiresQuantity: false },
  { name: 'Coriander', category: 'spices', requiresQuantity: false },
  { name: 'Sage', category: 'spices', requiresQuantity: false },
  { name: 'Dill', category: 'spices', requiresQuantity: false },
  { name: 'Parsley Flakes', category: 'spices', requiresQuantity: false },
  { name: 'Italian Seasoning', category: 'spices', requiresQuantity: false },
  { name: 'Herbs de Provence', category: 'spices', requiresQuantity: false },
  { name: 'Old Bay', category: 'spices', requiresQuantity: false },

  // Condiments
  { name: 'Ketchup', category: 'condiments', requiresQuantity: false },
  { name: 'Mustard', category: 'condiments', requiresQuantity: false },
  { name: 'Mayonnaise', category: 'condiments', requiresQuantity: false },
  { name: 'Soy Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Hot Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Worcestershire Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Balsamic Vinegar', category: 'condiments', requiresQuantity: false },
  { name: 'Honey', category: 'condiments', requiresQuantity: false },
  { name: 'Dijon Mustard', category: 'condiments', requiresQuantity: false },
  { name: 'Yellow Mustard', category: 'condiments', requiresQuantity: false },
  { name: 'BBQ Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Ranch Dressing', category: 'condiments', requiresQuantity: false },
  { name: 'Italian Dressing', category: 'condiments', requiresQuantity: false },
  { name: 'Caesar Dressing', category: 'condiments', requiresQuantity: false },
  { name: 'Tahini', category: 'condiments', requiresQuantity: false },
  { name: 'Sriracha', category: 'condiments', requiresQuantity: false },
  { name: 'Teriyaki Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Fish Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Oyster Sauce', category: 'condiments', requiresQuantity: false },
  { name: 'Hoisin Sauce', category: 'condiments', requiresQuantity: false },

  // Frozen
  { name: 'Frozen Vegetables', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Ice Cream', category: 'frozen', requiresQuantity: true, commonUnits: ['pints', 'quarts'] },
  { name: 'Frozen Pizza', category: 'frozen', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Frozen Berries', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen Peas', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen Corn', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen Broccoli', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen Spinach', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen French Fries', category: 'frozen', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Frozen Waffles', category: 'frozen', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Frozen Burritos', category: 'frozen', requiresQuantity: true, commonUnits: ['pieces'] },
  { name: 'Frozen Chicken Nuggets', category: 'frozen', requiresQuantity: true, commonUnits: ['oz', 'pieces'] },

  // Beverages
  { name: 'Orange Juice', category: 'beverages', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Coffee', category: 'beverages', requiresQuantity: false },
  { name: 'Tea', category: 'beverages', requiresQuantity: false },
  { name: 'Apple Juice', category: 'beverages', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Cranberry Juice', category: 'beverages', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Lemonade', category: 'beverages', requiresQuantity: true, commonUnits: ['cups', 'oz'] },
  { name: 'Soda', category: 'beverages', requiresQuantity: true, commonUnits: ['cans', 'bottles'] },
  { name: 'Sparkling Water', category: 'beverages', requiresQuantity: true, commonUnits: ['cans', 'bottles'] },
  { name: 'Beer', category: 'beverages', requiresQuantity: true, commonUnits: ['bottles', 'cans'] },
  { name: 'Wine', category: 'beverages', requiresQuantity: true, commonUnits: ['bottles'] },

  // Snacks
  { name: 'Chips', category: 'snacks', requiresQuantity: true, commonUnits: ['bags'] },
  { name: 'Crackers', category: 'snacks', requiresQuantity: false },
  { name: 'Pretzels', category: 'snacks', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Popcorn', category: 'snacks', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Nuts', category: 'snacks', requiresQuantity: true, commonUnits: ['oz', 'lb'] },
  { name: 'Trail Mix', category: 'snacks', requiresQuantity: true, commonUnits: ['bags', 'oz'] },
  { name: 'Granola Bars', category: 'snacks', requiresQuantity: true, commonUnits: ['pieces', 'boxes'] },
  { name: 'Cookies', category: 'snacks', requiresQuantity: true, commonUnits: ['pieces', 'packages'] },
  { name: 'Candy', category: 'snacks', requiresQuantity: true, commonUnits: ['pieces', 'bags'] },
];

/**
 * Get ingredients grouped by category
 */
export function getIngredientsByCategory(): Record<string, CommonIngredient[]> {
  const grouped: Record<string, CommonIngredient[]> = {};
  
  COMMON_INGREDIENTS.forEach(ingredient => {
    if (!grouped[ingredient.category]) {
      grouped[ingredient.category] = [];
    }
    grouped[ingredient.category].push(ingredient);
  });
  
  return grouped;
}

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<string, string> = {
  produce: 'Produce',
  dairy: 'Eggs & Dairy',
  meat: 'Meat & Seafood',
  bakery: 'Bakery',
  pantry: 'Pantry Staples',
  frozen: 'Frozen',
  beverages: 'Beverages',
  snacks: 'Snacks',
  spices: 'Spices & Herbs',
  condiments: 'Condiments',
  other: 'Other',
};

/**
 * Category display order (for consistent sorting)
 * Categories not in this list will appear at the end, with 'other' always last
 */
export const CATEGORY_ORDER: PantryCategory[] = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'pantry',
  'frozen',
  'beverages',
  'snacks',
  'spices',
  'condiments',
  'other',
];

