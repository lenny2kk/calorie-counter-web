export interface OpenFoodFactsNutriments {
  'energy-kcal_100g'?: number;
  'proteins_100g'?: number;
  'carbohydrates_100g'?: number;
  'fat_100g'?: number;
  [key: string]: any;
}

export interface OpenFoodFactsProductData {
  product_name?: string;
  product_name_pl?: string;
  nutriments?: OpenFoodFactsNutriments;
  [key: string]: any;
}

export interface OpenFoodFactsResponse {
  status: string;
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
 * Fetch product details from Open Food Facts by barcode (EAN-13, etc.)
 */
export const fetchProductByBarcode = async (barcode: string): Promise<LocalProductDetails | null> => {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${cleanBarcode}.json`, {
      headers: {
        'User-Agent': 'CalorieCounterApp - Web - Version 1.0 - https://github.com/lenny2kk/calorie-counter-IOS'
      }
    });

    if (!response.ok) {
      throw new Error(`Open Food Facts API returned status: ${response.status}`);
    }

    const data: OpenFoodFactsResponse = await response.json();

    // In API v3, check status. If it's "success" or "found" (sometimes status is verbose)
    if (data.status === 'failure' || !data.product) {
      return null;
    }

    const p = data.product;
    const nut = p.nutriments || {};

    const name = p.product_name_pl || p.product_name || `Produkt ${cleanBarcode}`;
    const kcalPer100g = Number(nut['energy-kcal_100g'] ?? 0);
    const proteinPer100g = Number(nut['proteins_100g'] ?? 0);
    const carbsPer100g = Number(nut['carbohydrates_100g'] ?? 0);
    const fatPer100g = Number(nut['fat_100g'] ?? 0);

    return {
      name,
      kcalPer100g,
      proteinPer100g,
      carbsPer100g,
      fatPer100g,
      barcode: cleanBarcode,
      source: 'openfoodfacts'
    };
  } catch (error) {
    console.error("Błąd podczas pobierania danych z Open Food Facts:", error);
    throw error;
  }
};
