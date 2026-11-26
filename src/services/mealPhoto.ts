import { BASE_URL, cleanJsonResponse } from './dietitian';

/**
 * Szacowanie kalorii posiłku ze zdjęcia i krótkiego opisu – bez podawania gramatury.
 * Model ocenia wielkość porcji po punktach odniesienia (talerz, sztućce, dłoń)
 * i zwraca wartości dla CAŁEJ porcji, z rozbiciem na składniki.
 */

export type EstimateConfidence = 'low' | 'medium' | 'high';

export interface DishComponent {
  name: string;
  grams: number;
  calories: number;
}

export interface DishEstimate {
  name: string;
  /** Szacowana waga całej porcji w gramach */
  portionGrams: number;
  /** Wartości dla całej porcji */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: EstimateConfidence;
  components: DishComponent[];
  /** Co model przyjął, a czego nie widać (np. ilość oleju) */
  assumptions: string;
}

export class NotFoodError extends Error {}

const buildPrompt = (description: string) => `Jesteś doświadczonym dietetykiem. Na zdjęciu jest posiłek użytkownika. Oszacuj, ile waży porcja i ile ma kalorii oraz makroskładników. Użytkownik NIE podaje gramatury – to Ty oceniasz wielkość porcji.

Opis od użytkownika (może być pusty): """${description || '(brak opisu)'}"""

Jak szacować:
1. Rozpoznaj każdy składnik. Opis użytkownika ma pierwszeństwo przed tym, co widać: rodzaj mięsa, sposób przygotowania, dodatki niewidoczne na zdjęciu (masło, cukier, sos pod spodem).
2. Wielkość porcji oceniaj po punktach odniesienia: płaski talerz obiadowy ma ok. 26 cm średnicy, talerz głęboki ok. 22 cm, talerzyk deserowy ok. 19 cm, widelec ok. 19 cm, kubek ok. 250 ml, dłoń dorosłego ok. 18 cm.
3. Doliczaj ukryte kalorie w typowej ilości dla tej potrawy: olej do smażenia, panierka, sosy, dressing, masło.
4. Podawaj wartości dla CAŁEJ porcji, którą użytkownik zje – nie na 100 g.
5. Jeśli opis mówi, ile zjedzono (np. „połowa”, „2 kawałki”, „bez frytek”), policz tylko tę część. Jeśli na zdjęciu jest więcej niż jedna porcja (cała pizza, garnek, półmisek), a opis tego nie wyjaśnia – policz jedną typową porcję i napisz to w "assumptions".
6. Kalorie muszą się zgadzać z makro (białko 4 kcal/g, węglowodany 4 kcal/g, tłuszcz 9 kcal/g) z dokładnością do ok. 10%.
7. "confidence": "high" gdy potrawa i porcja są dobrze widoczne; "medium" gdy część składników trzeba założyć; "low" gdy zdjęcie jest niewyraźne, potrawa jest w zamkniętym pojemniku albo nie da się ocenić wielkości.
8. Jeśli zdjęcie nie przedstawia jedzenia ani napoju, zwróć {"is_food": false}.

Zwróć wyłącznie JSON w tej strukturze:
{
  "is_food": true,
  "name": "krótka polska nazwa potrawy, max 40 znaków",
  "portion_grams": 350,
  "calories": 520,
  "protein": 32,
  "carbs": 55,
  "fat": 18,
  "confidence": "medium",
  "components": [{"name": "pierś z kurczaka grillowana", "grams": 150, "calories": 240}],
  "assumptions": "Jedno krótkie zdanie po polsku: co założono, czego nie widać."
}`;

const num = (v: unknown, max: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};
const text = (v: unknown, maxLen: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, maxLen) : '';
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Odpowiedź modelu traktujemy jak niezaufane dane – tylko rozsądne, skończone liczby i krótkie teksty. */
export const parseDishEstimate = (raw: unknown): DishEstimate => {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (p.is_food === false) throw new NotFoodError('Na zdjęciu nie widzę jedzenia.');

  const components: DishComponent[] = (Array.isArray(p.components) ? p.components : [])
    .slice(0, 12)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { name: text(o.name, 60), grams: Math.round(num(o.grams, 3000)), calories: Math.round(num(o.calories, 5000)) };
    })
    .filter((c) => c.name);

  const protein = r1(num(p.protein, 500));
  const carbs = r1(num(p.carbs, 1000));
  const fat = r1(num(p.fat, 500));
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  const fromComponents = components.reduce((s, c) => s + c.calories, 0);
  // Gdy model nie poda sumy, bierzemy ją ze składników albo z makro
  const calories = Math.round(num(p.calories, 8000) || fromComponents || fromMacros);
  const portionGrams = Math.round(num(p.portion_grams, 5000) || components.reduce((s, c) => s + c.grams, 0));

  if (!calories) throw new Error('Nie udało się oszacować kalorii. Zrób zdjęcie z bliższej odległości albo dopisz opis.');

  const confidence: EstimateConfidence =
    p.confidence === 'high' || p.confidence === 'medium' || p.confidence === 'low' ? p.confidence : 'medium';

  return {
    name: text(p.name, 40) || 'Posiłek ze zdjęcia',
    portionGrams: portionGrams || 1,
    calories,
    protein,
    carbs,
    fat,
    confidence,
    components,
    assumptions: text(p.assumptions, 220),
  };
};

export async function estimateDishFromPhoto(params: {
  apiKey: string;
  imageBase64: string;
  description?: string;
}): Promise<DishEstimate> {
  const { apiKey, imageBase64 } = params;
  if (!apiKey) throw new Error('Brak klucza API Gemini! Skonfiguruj go w Ustawieniach.');

  const description = (params.description ?? '').replace(/"""/g, '"').trim().slice(0, 300);

  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Klucz w nagłówku, a nie w URL – adresy URL trafiają do logów i historii
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: buildPrompt(description) },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Błąd serwera (${response.status})`);
  }

  const result = await response.json();
  const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Brak odpowiedzi od Gemini. Spróbuj ponownie.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJsonResponse(rawText));
  } catch {
    console.error('Błąd parsowania JSON potrawy:', rawText);
    throw new Error('Nie udało się odczytać odpowiedzi AI. Spróbuj ponownie.');
  }
  return parseDishEstimate(parsed);
}
