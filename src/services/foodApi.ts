export interface OpenFoodFactsNutriments {
  'energy-kcal_100g'?: number;
  'energy-kcal'?: number;
  'proteins_100g'?: number;
  'proteins'?: number;
  'carbohydrates_100g'?: number;
  'carbohydrates'?: number;
  'fat_100g'?: number;
  'fat'?: number;
  [key: string]: any;
}

export interface OpenFoodFactsProductData {
  product_name?: string;
  product_name_pl?: string;
  nutriments?: OpenFoodFactsNutriments;
  [key: string]: any;
}

export interface OpenFoodFactsResponse {
  status: number | string;
  product?: OpenFoodFactsProductData;
  [key: string]: any;
}

export interface LocalProductDetails {
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  barcode: string;
  source: 'openfoodfacts' | 'manual';
}

/**
 * Parser to map Open Food Facts product structure to LocalProductDetails.
 * Resolves properties from both energy-kcal_100g and energy-kcal for maximum regional coverage.
 */
export const parseOpenFoodFacts = (p: OpenFoodFactsProductData, barcode: string): LocalProductDetails => {
  const nut = p.nutriments || {};
  const name = p.product_name_pl || p.product_name || `Produkt ${barcode}`;
  
  // Extract values, falling back to direct keys if _100g fields are omitted
  const kcalPer100g = Number(nut['energy-kcal_100g'] ?? nut['energy-kcal'] ?? nut['energy_kcal'] ?? 0);
  const proteinPer100g = Number(nut['proteins_100g'] ?? nut['proteins'] ?? 0);
  const carbsPer100g = Number(nut['carbohydrates_100g'] ?? nut['carbohydrates'] ?? 0);
  const fatPer100g = Number(nut['fat_100g'] ?? nut['fat'] ?? 0);

  return {
    name,
    kcalPer100g: Math.round(kcalPer100g * 10) / 10,
    proteinPer100g: Math.round(proteinPer100g * 10) / 10,
    carbsPer100g: Math.round(carbsPer100g * 10) / 10,
    fatPer100g: Math.round(fatPer100g * 10) / 10,
    barcode,
    source: 'openfoodfacts'
  };
};

/**
 * Fetch product details by barcode, cascading over keyless global and regional Open Food Facts endpoints.
 */
export const fetchProductByBarcode = async (
  barcode: string,
  onStatusUpdate?: (status: string) => void
): Promise<LocalProductDetails | null> => {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  const userAgent = 'CalorieCounterApp - Web - Version 1.0 - https://github.com/lenny2kk/calorie-counter-IOS';

  // KROK 1: Główne API Open Food Facts (Baza globalna v3)
  try {
    if (onStatusUpdate) {
      onStatusUpdate("Sprawdzam bazę główną...");
    }
    const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': userAgent
      }
    });

    if (response.ok) {
      const data: OpenFoodFactsResponse = await response.json();
      if (data.product) {
        return parseOpenFoodFacts(data.product, cleanBarcode);
      }
    }
  } catch (error) {
    console.warn("Błąd bazy głównej v3:", error);
  }

  // KROK 2: Regionalne polskie API Open Food Facts (Baza lokalna v2)
  try {
    if (onStatusUpdate) {
      onStatusUpdate("Brak w bazie globalnej, przeszukuję polski rejestr...");
    }
    const response = await fetch(`https://pl.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': userAgent
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.product && (data.status === 1 || data.status === 'success' || data.status === 'found')) {
        return parseOpenFoodFacts(data.product, cleanBarcode);
      }
    }
  } catch (error) {
    console.warn("Błąd regionalnej bazy v2:", error);
  }

  // KROK 3: Globalne API Open Food Facts v2 (Alternatywny fallback)
  try {
    if (onStatusUpdate) {
      onStatusUpdate("Przeszukuję zapasowy rejestr globalny...");
    }
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': userAgent
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.product && (data.status === 1 || data.status === 'success' || data.status === 'found')) {
        return parseOpenFoodFacts(data.product, cleanBarcode);
      }
    }
  } catch (error) {
    console.warn("Błąd zapasowej bazy v2:", error);
  }

  return null;
};
