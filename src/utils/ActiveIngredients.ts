export interface ActiveIngredient {
  name: string;
  strength?: string;
}

const STRENGTH_PATTERN = /^(.+?)\s+(\d+(?:[,.]\d+)?\s*(?:mg|µg|mcg|g|ml|IE|I\.E\.|mmol|%))$/i;

export function parseActiveIngredients(value: string): ActiveIngredient[] {
  const normalized = value.trim();
  if (!normalized) return [];

  return splitActiveIngredientText(normalized)
    .map(part => parseActiveIngredientPart(part))
    .filter((part): part is ActiveIngredient => part.name.length > 0);
}

export function formatActiveIngredient(ingredient: ActiveIngredient): string {
  return [ingredient.name, ingredient.strength].filter(Boolean).join(' ');
}

export function formatActiveIngredientStrengthSummary(value: string): string | null {
  const ingredients = parseActiveIngredients(value);
  if (ingredients.length === 0 || ingredients.some(ingredient => !ingredient.strength)) {
    return null;
  }

  return ingredients.map(ingredient => ingredient.strength).join(' + ');
}

function splitActiveIngredientText(value: string): string[] {
  if (value.includes('+')) {
    return value.split(/\s*\+\s*/);
  }

  if (shouldSplitSlashSeparated(value)) {
    return value.split(/\s*\/\s*/);
  }

  return [value];
}

function shouldSplitSlashSeparated(value: string): boolean {
  const parts = value.split(/\s*\/\s*/).filter(Boolean);
  return parts.length > 1 && parts.every(part => /[A-Za-zÄÖÜäöüß]/.test(part));
}

function parseActiveIngredientPart(value: string): ActiveIngredient {
  const trimmed = value.trim();
  const match = trimmed.match(STRENGTH_PATTERN);
  if (!match) {
    return { name: trimmed };
  }

  return {
    name: match[1].trim(),
    strength: match[2].trim(),
  };
}
