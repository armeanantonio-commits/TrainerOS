import PDFDocument from 'pdfkit';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeminiText } from '../lib/gemini.js';
import type { GenerationPromptContext } from '../lib/generation-history.js';
import { buildAntiRepeatPromptSection } from '../lib/generation-history.js';
import { buildAiLanguageInstruction, normalizeLanguage, type SupportedLanguage } from '../lib/language.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const REPORTS_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads', 'nutrition-reports');
const LOGO_PATH =
  process.env.TRAINEROS_LOGO_PATH || path.resolve(__dirname, '../../../frontend/public/logo.jpeg');
const NUTRITION_ASSETS_DIR =
  process.env.NUTRITION_ASSETS_DIR || path.resolve(__dirname, '../../../nutrition');
const BACKEND_PUBLIC_URL =
  process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BACKEND_URL || 'https://api.traineros.org';

const PDF_THEME = {
  page: '#070d16',
  panel: '#0c1624',
  panelAlt: '#0f1d30',
  panelSoft: '#112338',
  border: '#1d384d',
  text: '#f8fbff',
  muted: '#e4edf7',
  dim: '#c7d5e6',
  accent: '#2ea67a',
  accentStrong: '#1f7f5e',
  accentBlue: '#56b6ff',
  accentGold: '#f7c86c',
  accentRose: '#ff8cb8',
  danger: '#ff9b7e',
} as const;

type SvgShape =
  | { type: 'path'; d: string; fill: string }
  | { type: 'circle'; cx: number; cy: number; r: number; fill: string };

interface SvgAsset {
  viewBox: [number, number, number, number];
  shapes: SvgShape[];
}

const svgAssetCache = new Map<string, Promise<SvgAsset | null>>();

export interface GenerateNutritionReportInput {
  clientName: string;
  age: number;
  sex: 'male' | 'female' | 'other';
  weightKg: number;
  heightCm: number;
  activityLevel: 'sedentary' | 'lightly-active' | 'moderately-active' | 'very-active' | 'athlete';
  preferredEatingStyle:
    | 'anything'
    | 'high-protein'
    | 'vegetarian'
    | 'vegan'
    | 'pescatarian'
    | 'mediterranean';
  objective: 'lose-weight' | 'maintain' | 'gain-muscle' | 'recomposition' | 'performance';
  goalWeightKg?: number;
  targetDate?: string;
  clientNotes?: string;
  calories: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
  mealsPerDayType: '3' | '3+1' | '4' | '5' | 'custom';
  customMealsPerDay?: number;
  macroDistributionType: 'equal' | 'around-workout' | 'more-evening-carbs' | 'low-carb-breakfast' | 'custom';
  customMacroDistribution?: string;
  wakeUpTime: string;
  sleepTime: string;
  hasTraining: boolean;
  trainingTime?: string;
  workProgram?: 'fixed' | 'shifts' | 'flexible' | 'mostly-home';
  mealLocations: Array<'home' | 'office' | 'delivery' | 'canteen' | 'on-the-go'>;
  cookingLevel: 'daily' | 'meal-prep' | 'rare' | 'almost-never';
  foodBudget: 'low' | 'medium' | 'high';
  dietaryRestrictions: Array<
    | 'lactose-free'
    | 'gluten-free'
    | 'vegetarian'
    | 'vegan'
    | 'intermittent-fasting'
    | 'religious-fasting'
    | 'allergies'
  >;
  allergiesDetails?: string;
  excludedFoodsAndPreferences?: string;
  planStyle: 'exact-grams' | 'macros-plus-examples' | 'flexible-template' | 'full-day-with-alternatives';
  language?: SupportedLanguage;
  generationContext?: GenerationPromptContext;
}

export interface NutritionReportResult {
  reportTitle: string;
  executiveSummary: string;
  introduction: string[];
  calculations: {
    overview: string;
    aboutClient: string[];
    macroRatioText: string;
    calorieTargetText: string;
    goalText: string;
  };
  dailyPortions: Array<{
    key: 'protein' | 'vegetables' | 'carbs' | 'fats';
    title: string;
    perDay: string;
    perMeal: string;
    approximateGrams: string;
    whyItMatters: string;
    examples: string[];
  }>;
  mealIdeas: Array<{
    title: string;
    components: string[];
    note?: string;
  }>;
  mealPlanning: {
    title: string;
    paragraphs: string[];
    bullets: string[];
  };
  trackingConsistency: {
    title: string;
    paragraphs: string[];
    bullets: string[];
    targetConsistency: string;
  };
  weeklyTracker: {
    intro: string;
    proteinPerDay: string;
    vegetablesPerDay: string;
    carbsPerDay: string;
    fatsPerDay: string;
  };
  foodChoices: {
    protein: { eatMore: string[]; eatSome: string[]; eatLess: string[] };
    carbs: { eatMore: string[]; eatSome: string[]; eatLess: string[] };
    fats: { eatMore: string[]; eatSome: string[]; eatLess: string[] };
    vegetablesRainbow: string[];
    guideline: string;
  };
  adjustments: {
    title: string;
    paragraphs: string[];
    rules: string[];
  };
  finalThoughts: {
    title: string;
    paragraphs: string[];
  };
}

export interface NutritionReportPdfArtifact {
  buffer: Buffer;
  filename: string;
  filePath: string;
  publicUrl: string;
}

type PlanStyleConfig = {
  label: string;
  reportTitleSuffix: string;
  summaryLine: string;
  promptRules: string[];
};

function getPlanStyleConfig(
  planStyle: GenerateNutritionReportInput['planStyle']
): PlanStyleConfig {
  switch (planStyle) {
    case 'exact-grams':
      return {
        label: 'Gramaje exacte',
        reportTitleSuffix: 'cu gramaje exacte',
        summaryLine:
          'Livrează un plan precis, cu porții și exemple exprimate în grame, ușor de cântărit și urmărit.',
        promptRules: [
          'Raportul trebuie să fie orientat spre precizie. În ideile de mese și în recomandări, oferă cantități concrete în grame sau mililitri.',
          'La meal planning, insistă pe cântar alimentar, etichete și repetabilitate.',
          'Exemplele trebuie să sune ca un plan strict, nu ca un ghid flexibil.',
        ],
      };
    case 'macros-plus-examples':
      return {
        label: 'Macro + exemple',
        reportTitleSuffix: 'cu macro-uri și exemple',
        summaryLine:
          'Livrează un plan echilibrat: macro-uri clare, porții ușor de urmărit și exemple concrete de mese.',
        promptRules: [
          'Raportul trebuie să combine clar țintele de macro-uri cu exemple practice de mese.',
          'Nu transforma raportul într-un plan strict la gram. Accentul este pe repere și exemple aplicabile.',
          'În meal ideas, arată clar cum se încadrează exemplele în macro-uri.',
        ],
      };
    case 'flexible-template':
      return {
        label: 'Template flexibil',
        reportTitleSuffix: 'în format flexibil',
        summaryLine:
          'Livrează un template flexibil, bazat pe structuri de mese și opțiuni interschimbabile, nu pe un meniu rigid.',
        promptRules: [
          'Raportul trebuie să fie clar flexibil. Explică structura meselor și cum poate clientul să înlocuiască alimentele între ele fără să strice planul.',
          'În ideile de mese, folosește formule de tip proteină + carbohidrat + legume + grăsime și oferă alternative interschimbabile.',
          'Evită tonul de plan fix. Accentul trebuie să fie pe adaptabilitate și execuție în viața reală.',
        ],
      };
    case 'full-day-with-alternatives':
      return {
        label: 'Zi completă + alternative',
        reportTitleSuffix: 'cu zi completă și alternative',
        summaryLine:
          'Livrează un plan mai concret, cu exemple de zi completă și alternative pentru fiecare masă principală.',
        promptRules: [
          'Raportul trebuie să pară cel mai concret dintre toate cele 4 stiluri: o zi completă clară și alternative pentru mese.',
          'În meal ideas, organizează exemplele ca mic dejun, prânz, cină, gustare și variante de schimb.',
          'Meal planning trebuie să explice cum rotești alternativele fără să pierzi controlul asupra obiectivului.',
        ],
      };
  }
}

type IngredientPools = {
  proteins: string[];
  carbs: string[];
  fats: string[];
  vegetables: string[];
  fruit: string[];
  convenience: string[];
};

function uniqueFirst(values: string[], count: number): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, count);
}

function parseExcludedTerms(input: GenerateNutritionReportInput): string[] {
  return `${input.excludedFoodsAndPreferences || ''},${input.allergiesDetails || ''}`
    .toLowerCase()
    .split(/[,;\n/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function filterExcluded(values: string[], excludedTerms: string[]): string[] {
  return values.filter((value) => !excludedTerms.some((term) => value.toLowerCase().includes(term)));
}

function buildIngredientPools(input: GenerateNutritionReportInput): IngredientPools {
  const excludedTerms = parseExcludedTerms(input);
  const isVegetarian = input.preferredEatingStyle === 'vegetarian' || input.dietaryRestrictions.includes('vegetarian');
  const isVegan = input.preferredEatingStyle === 'vegan' || input.dietaryRestrictions.includes('vegan');
  const isPescatarian = input.preferredEatingStyle === 'pescatarian';

  let proteins = ['piept de pui', 'curcan', 'ouă', 'iaurt grecesc', 'ton', 'somon', 'skyr', 'brânză cottage', 'tofu'];
  let carbs = ['ovăz', 'orez', 'cartofi', 'paste integrale', 'lipie integrală', 'pâine integrală', 'banane', 'fructe de pădure'];
  let fats = ['ulei de măsline', 'avocado', 'nuci', 'semințe de chia', 'unt de arahide'];
  let vegetables = ['spanac', 'broccoli', 'roșii', 'ardei', 'morcovi', 'castraveți', 'salată verde'];
  let fruit = ['banane', 'mere', 'afine', 'portocale', 'kiwi'];
  let convenience = ['iaurt proteic', 'wrap simplu', 'conservă de ton', 'salată gata spălată', 'orez prefiert'];

  if (input.preferredEatingStyle === 'high-protein') {
    proteins = ['piept de pui', 'curcan', 'albușuri', 'skyr', 'iaurt grecesc', 'ton', 'vită slabă', 'whey protein'];
    convenience = ['shake proteic', 'iaurt proteic', 'curcan felii', 'orez la plic', 'ton la conservă'];
  } else if (input.preferredEatingStyle === 'mediterranean') {
    proteins = ['somon', 'ton', 'ouă', 'iaurt grecesc', 'pui', 'brânză feta light'];
    carbs = ['cartofi', 'orez', 'lipie integrală', 'năut', 'linte', 'fructe'];
    fats = ['ulei de măsline', 'măsline', 'avocado', 'nuci'];
    vegetables = ['roșii', 'castraveți', 'ardei', 'dovlecei', 'vinete', 'spanac'];
  } else if (isPescatarian) {
    proteins = ['somon', 'ton', 'creveți', 'ouă', 'iaurt grecesc', 'tofu'];
  } else if (isVegetarian) {
    proteins = ['ouă', 'iaurt grecesc', 'skyr', 'brânză cottage', 'tofu', 'tempeh', 'linte', 'năut'];
    carbs = ['ovăz', 'orez', 'cartofi', 'paste integrale', 'linte', 'fasole', 'fructe'];
  } else if (isVegan) {
    proteins = ['tofu', 'tempeh', 'edamame', 'linte', 'năut', 'fasole', 'proteină vegetală'];
    carbs = ['ovăz', 'orez', 'cartofi', 'quinoa', 'fructe'];
    fats = ['ulei de măsline', 'avocado', 'tahini', 'nuci', 'semințe'];
    convenience = ['tofu marinat', 'edamame', 'iaurt vegetal fortificat', 'salată gata preparată'];
  }

  if (input.dietaryRestrictions.includes('lactose-free')) {
    proteins = proteins.filter((item) => !['iaurt grecesc', 'skyr', 'brânză cottage', 'brânză feta light'].includes(item));
    proteins.push('iaurt fără lactoză', 'brânză fără lactoză');
  }

  if (input.dietaryRestrictions.includes('gluten-free')) {
    carbs = carbs.filter((item) => !['paste integrale', 'lipie integrală', 'pâine integrală'].includes(item));
    carbs.push('orez expandat', 'mămăligă', 'ovăz fără gluten');
  }

  if (input.foodBudget === 'low') {
    proteins = ['ouă', 'iaurt grecesc', 'piept de pui', 'ton', 'linte', 'năut', ...proteins];
    carbs = ['ovăz', 'orez', 'cartofi', 'banane', ...carbs];
  } else if (input.foodBudget === 'high') {
    proteins = [...proteins, 'vită slabă premium', 'somon sălbatic', 'creveți'];
    carbs = [...carbs, 'quinoa', 'cartof dulce'];
  }

  if (input.mealLocations.includes('delivery')) {
    convenience = [...convenience, 'poke bowl simplu', 'bol cu orez și pui', 'salată cu proteină'];
  }
  if (input.mealLocations.includes('office')) {
    convenience = [...convenience, 'caserolă rece cu proteină', 'wrap transportabil', 'iaurt proteic de birou'];
  }
  if (input.cookingLevel === 'almost-never' || input.cookingLevel === 'rare') {
    convenience = [...convenience, 'pui rotisat slab', 'cartofi pentru microunde', 'mix de salată'];
  }

  return {
    proteins: uniqueFirst(filterExcluded(proteins, excludedTerms), 10),
    carbs: uniqueFirst(filterExcluded(carbs, excludedTerms), 10),
    fats: uniqueFirst(filterExcluded(fats, excludedTerms), 8),
    vegetables: uniqueFirst(filterExcluded(vegetables, excludedTerms), 8),
    fruit: uniqueFirst(filterExcluded(fruit, excludedTerms), 6),
    convenience: uniqueFirst(filterExcluded(convenience, excludedTerms), 8),
  };
}

function getMealsPerDay(input: GenerateNutritionReportInput): number {
  if (input.mealsPerDayType === 'custom') {
    return input.customMealsPerDay || 3;
  }

  if (input.mealsPerDayType === '3+1') {
    return 4;
  }

  return Number(input.mealsPerDayType);
}

function roundPortions(value: number): number {
  return Math.max(1, Math.round(value));
}

function formatPerMeal(value: number, mealsPerDay: number, suffix = ''): string {
  const base = value / mealsPerDay;
  const rounded = base <= 1.25 ? '1' : base <= 1.75 ? '1-2' : '2';
  return `${rounded}${suffix}`;
}

function fallbackDailyPortions(input: GenerateNutritionReportInput): NutritionReportResult['dailyPortions'] {
  const mealsPerDay = getMealsPerDay(input);
  const pools = buildIngredientPools(input);
  const proteinPortions = roundPortions(input.proteinGrams / 32);
  const carbPortions = roundPortions(input.carbsGrams / 35);
  const fatPortions = roundPortions(input.fatGrams / 13);
  const vegetablePortions = Math.max(mealsPerDay, roundPortions(mealsPerDay * 1.5));

  return [
    {
      key: 'protein',
      title: 'Proteine',
      perDay: `${proteinPortions} porții tip palmă / zi`,
      perMeal: `${formatPerMeal(proteinPortions, mealsPerDay)} porții / masă`,
      approximateGrams: `${input.proteinGrams} g / zi`,
      whyItMatters: 'Susțin sațietatea, recuperarea și menținerea masei musculare.',
      examples: pools.proteins.slice(0, 4),
    },
    {
      key: 'vegetables',
      title: 'Legume',
      perDay: `${vegetablePortions}-${vegetablePortions + Math.max(1, Math.round(mealsPerDay / 2))} porții tip pumn / zi`,
      perMeal: `${formatPerMeal(vegetablePortions, mealsPerDay)} porții / masă`,
      approximateGrams: 'minim 400-800 g / zi',
      whyItMatters: 'Aduc volum, fibre, micronutrienți și ajută controlul apetitului.',
      examples: pools.vegetables.slice(0, 4),
    },
    {
      key: 'carbs',
      title: 'Carbohidrați',
      perDay: `${carbPortions} porții tip mână căuș / zi`,
      perMeal: `${formatPerMeal(carbPortions, mealsPerDay)} porții / masă`,
      approximateGrams: `${input.carbsGrams} g / zi`,
      whyItMatters: 'Susțin energia, performanța și refacerea, mai ales în jurul antrenamentului.',
      examples: [...pools.carbs.slice(0, 3), pools.fruit[0]].filter(Boolean),
    },
    {
      key: 'fats',
      title: 'Grăsimi sănătoase',
      perDay: `${fatPortions} porții tip deget mare / zi`,
      perMeal: `${formatPerMeal(fatPortions, mealsPerDay)} porții / masă`,
      approximateGrams: `${input.fatGrams} g / zi`,
      whyItMatters: 'Ajută hormonii, sațietatea și absorbția vitaminelor liposolubile.',
      examples: pools.fats.slice(0, 4),
    },
  ];
}

function buildFallbackReport(input: GenerateNutritionReportInput): NutritionReportResult {
  const mealsPerDay = getMealsPerDay(input);
  const styleConfig = getPlanStyleConfig(input.planStyle);
  const pools = buildIngredientPools(input);

  const styleSpecificMealIdeas: NutritionReportResult['mealIdeas'] =
    input.planStyle === 'exact-grams'
      ? [
          {
            title: 'Mic dejun măsurat exact',
            components: [`200 g ${pools.proteins[0]}`, `60 g ${pools.carbs[0]}`, `120 g ${pools.fruit[0]}`, `15 g ${pools.fats[0]}`],
            note: 'Model pentru client care cântărește alimentele și urmărește precizia.',
          },
          {
            title: 'Prânz cu gramaje fixe',
            components: [`170 g ${pools.proteins[1] || pools.proteins[0]} gătit`, `180 g ${pools.carbs[1] || pools.carbs[0]}`, `250 g ${pools.vegetables[0]} + ${pools.vegetables[1] || pools.vegetables[0]}`, `10 g ${pools.fats[0]}`],
          },
          {
            title: 'Cină cu distribuție clară',
            components: [`160 g ${pools.proteins[2] || pools.proteins[0]}`, `220 g ${pools.carbs[2] || pools.carbs[0]}`, `200 g ${pools.vegetables[2] || pools.vegetables[0]}`, `5 g ${pools.fats[1] || pools.fats[0]} pentru finisare`],
          },
          {
            title: 'Gustare controlată',
            components: ['30 g proteină pudră', '1 banană medie', '15 g unt de arahide'],
          },
          {
            title: 'Variantă rapidă de birou',
            components: ['150 g ton în suc propriu', '120 g lipie integrală', '150 g legume crude', '20 g hummus'],
          },
          {
            title: 'Variantă post-antrenament',
            components: ['180 g iaurt skyr', '70 g cereale simple', '1 fruct mare'],
          },
        ]
      : input.planStyle === 'flexible-template'
        ? [
            {
              title: 'Template mic dejun flexibil',
              components: [`Proteină: ${pools.proteins.slice(0, 3).join(' / ')}`, `Carbohidrat: ${pools.carbs.slice(0, 3).join(' / ')}`, `Fruct/legume: ${[...pools.fruit.slice(0, 2), ...pools.vegetables.slice(0, 2)].join(' / ')}`, `Grăsimi: ${pools.fats.slice(0, 2).join(' / ')}`],
              note: 'Poți roti între opțiunile de mai sus fără să schimbi logica mesei.',
            },
            {
              title: 'Template prânz simplu',
              components: ['1-2 palme proteină', '1-2 mâini căuș carbohidrați', '1-2 pumni legume', '1 deget mare grăsimi'],
            },
            {
              title: 'Template cină ușor de adaptat',
              components: ['proteină principală', 'legume multe', 'carbohidrați ajustați după obiectiv', 'grăsimi moderate'],
            },
            {
              title: 'Template gustare',
              components: ['proteină rapidă', 'fruct sau carbohidrat simplu', 'opțional grăsimi dacă masa următoare e departe'],
            },
            {
              title: 'Masă de luat la pachet',
              components: ['proteină gata preparată', 'garnitură ușor de transportat', 'legume crocante', 'sos simplu'],
            },
            {
              title: 'Masă comandată controlat',
              components: [`Bază proteică: ${pools.proteins.slice(0, 3).join(' / ')}`, `Garnitură: ${pools.carbs.slice(0, 2).join(' / ')}`, `Legume: ${pools.vegetables.slice(0, 3).join(' / ')}`, 'Eviți extra-urile calorice ascunse'],
            },
          ]
        : input.planStyle === 'full-day-with-alternatives'
          ? [
              {
                title: 'Mic dejun principal',
                components: [`${pools.proteins[0]} cu ${pools.vegetables[0]}`, `${pools.carbs[0]}`, `${pools.fruit[0]}`],
                note: `Alternativă: ${pools.proteins[1] || pools.proteins[0]} cu ${pools.carbs[1] || pools.carbs[0]} și ${pools.fruit[1] || pools.fruit[0]}.`,
              },
              {
                title: 'Gustare 1',
                components: [`${pools.proteins[2] || pools.proteins[0]}`, `${pools.fruit[2] || pools.fruit[0]}`],
                note: `Alternativă: ${pools.proteins[3] || pools.proteins[0]} cu ${pools.carbs[2] || pools.carbs[0]}.`,
              },
              {
                title: 'Prânz principal',
                components: [`${pools.proteins[4] || pools.proteins[0]}`, `${pools.carbs[3] || pools.carbs[0]}`, `${pools.vegetables.slice(0, 2).join(' + ')}`],
                note: `Alternativă: ${pools.convenience[0] || 'variantă rapidă'} cu ${pools.proteins[1] || pools.proteins[0]} și legume.`,
              },
              {
                title: 'Gustare 2 / pre-workout',
                components: ['banană', 'iaurt sau baton simplu bogat în proteină'],
              },
              {
                title: 'Cină principală',
                components: [`${pools.proteins[5] || pools.proteins[0]}`, `${pools.vegetables.slice(2, 4).join(' + ') || pools.vegetables[0]}`, `${pools.carbs[4] || pools.carbs[0]} adaptat obiectivului`],
                note: `Alternativă: ${pools.proteins[6] || pools.proteins[0]} cu ${pools.vegetables[4] || pools.vegetables[0]}.`,
              },
              {
                title: 'Opțiune de rezervă pentru zile aglomerate',
                components: [pools.convenience.slice(0, 3).join(' + ')],
              },
            ]
          : [
              {
                title: 'Mic dejun orientat pe macro-uri',
                components: ['proteină principală', 'carbohidrați ușor de urmărit', 'fruct sau legume', 'grăsimi moderate'],
              },
              {
                title: 'Prânz cu structură clară',
                components: ['1-2 porții proteină', '1-2 porții carbohidrați', 'legume', 'grăsimi controlate'],
              },
              {
                title: 'Cină echilibrată',
                components: ['proteină', 'legume', 'carbohidrați ajustați după restul zilei'],
              },
              {
                title: 'Gustare bogată în proteină',
                components: ['iaurt / shake / brânză slabă', 'fruct', 'opțional o sursă mică de grăsimi'],
              },
              {
                title: 'Variantă pentru birou',
                components: ['masă simplă, transportabilă, cu macro-uri predictibile'],
              },
              {
                title: 'Variantă pentru după antrenament',
                components: ['proteină rapidă', 'carbohidrați ușor de digerat'],
              },
            ];

  const styleSpecificMealPlanning =
    input.planStyle === 'exact-grams'
      ? {
          title: 'Cum folosești planul cu gramaje exacte',
          paragraphs: [
            'Acesta este un format precis. Clientul trebuie să cântărească alimentele și să trateze gramajele ca referință principală pentru execuție.',
            'Cu cât repetă mai bine mesele și folosește aceleași porții, cu atât controlul asupra rezultatului va fi mai bun.',
          ],
          bullets: [
            'Folosește cântar alimentar pentru alimentele principale.',
            'Păstrează mesele repetitive în zilele de lucru pentru precizie.',
            'Verifică etichetele și diferența între gramaj crud și gătit.',
          ],
        }
      : input.planStyle === 'flexible-template'
        ? {
            title: 'Cum folosești template-ul flexibil',
            paragraphs: [
              'Acest format nu este un meniu rigid. Clientul pornește de la o structură clară de farfurie și schimbă alimentele între ele fără să piardă controlul.',
              'Scopul este aderența în viața reală: aceeași logică nutrițională, dar cu libertate de alegere în funcție de program, poftă și context.',
            ],
            bullets: [
              'Construiește fiecare masă din proteină + carbohidrat + legume + grăsimi.',
              'Schimbă sursele alimentare în aceeași categorie, nu tot planul.',
              'Folosește porțiile și reperele vizuale când nu poți cântări.',
            ],
          }
        : input.planStyle === 'full-day-with-alternatives'
          ? {
              title: 'Cum folosești ziua completă + alternative',
              paragraphs: [
                'Acest format oferă o zi-model clară și variante de schimb pentru mesele principale, astfel încât clientul să știe exact cum arată o zi bună de execuție.',
                'Alternativa nu înseamnă improvizație totală, ci rotirea unor opțiuni similare ca structură și aport.',
              ],
              bullets: [
                'Urmează ziua-model ca reper de bază.',
                'Schimbă mesele doar cu alternative din aceeași logică.',
                'Păstrează orele și distribuția meselor cât mai stabile.',
              ],
            }
          : {
              title: 'Cum folosești ghidul macro + exemple',
              paragraphs: [
                'Formatul combină claritatea macro-urilor cu exemple de mese ușor de pus în practică.',
                'Clientul poate urmări strict macro-urile sau poate folosi exemplele ca repere pentru construcția meselor.',
              ],
              bullets: [
                'Începe de la proteine și completează restul mesei în jurul lor.',
                'Folosește exemplele când ai nevoie de viteză în execuție.',
                'Ajustează porțiile în funcție de progres și feedback real.',
              ],
            };

  return {
    reportTitle: `Raport nutrițional personalizat ${styleConfig.reportTitleSuffix} pentru ${input.clientName}`,
    executiveSummary: `Acest raport oferă un punct de plecare clar pentru ${input.clientName}, cu ${input.calories} kcal și un aport zilnic de ${input.proteinGrams} g proteine, ${input.fatGrams} g grăsimi și ${input.carbsGrams} g carbohidrați, distribuite în ${mealsPerDay} mese. ${styleConfig.summaryLine}`,
    introduction: [
      `Acest ghid TrainerOS este creat pentru ${input.clientName} și transformă țintele zilnice în acțiuni simple, ușor de aplicat.`,
      'Scopul este progresul consecvent, nu perfecțiunea. Începe cu pași mici, urmărește consistența și ajustează doar după ce ai suficient feedback real.',
    ],
    calculations: {
      overview: 'Necesarul a fost construit pe baza profilului clientului, obiectivului, distribuției macro și contextului de viață.',
      aboutClient: [
        `Vârstă: ${input.age} ani`,
        `Sex: ${input.sex === 'male' ? 'Masculin' : input.sex === 'female' ? 'Feminin' : 'Altul'}`,
        `Greutate: ${input.weightKg} kg`,
        `Înălțime: ${input.heightCm} cm`,
        `Mese pe zi: ${mealsPerDay}`,
      ],
      macroRatioText: `Macro țintă: P ${input.proteinGrams} g | F ${input.fatGrams} g | C ${input.carbsGrams} g`,
      calorieTargetText: `Aport caloric zilnic recomandat: ${input.calories} kcal`,
      goalText: `Obiectiv: ${input.objective}`,
    },
    dailyPortions: fallbackDailyPortions(input),
    mealIdeas: styleSpecificMealIdeas,
    mealPlanning: styleSpecificMealPlanning,
    trackingConsistency: {
      title: 'Consistență și monitorizare',
      paragraphs: [
        'Pentru obiective moderate, o consistență de 75-80% este suficientă pentru progres stabil.',
        'Pentru obiective mai agresive sau performanță, consistența trebuie să fie mai aproape de 90%.',
      ],
      bullets: [
        'Bifează porțiile zilnic.',
        'Folosește același sistem de tracking minimum 2 săptămâni.',
        'Nu modifica planul după 2-3 zile fără rezultate.',
      ],
      targetConsistency: 'Țintă recomandată: 75-90% consecvență săptămânală',
    },
    weeklyTracker: {
      intro: 'Folosește foaia săptămânală pentru a verifica dacă atingi porțiile zilnice.',
      proteinPerDay: fallbackDailyPortions(input)[0].perDay,
      vegetablesPerDay: fallbackDailyPortions(input)[1].perDay,
      carbsPerDay: fallbackDailyPortions(input)[2].perDay,
      fatsPerDay: fallbackDailyPortions(input)[3].perDay,
    },
    foodChoices: {
      protein: {
        eatMore: pools.proteins.slice(0, 5),
        eatSome: [...pools.proteins.slice(5, 7), pools.convenience[0]].filter(Boolean),
        eatLess: ['mezeluri', 'carne prăjită', 'batoane proteice cu zahăr'],
      },
      carbs: {
        eatMore: [...pools.carbs.slice(0, 4), pools.fruit[0]].filter(Boolean),
        eatSome: [...pools.carbs.slice(4, 6), pools.fruit[1]].filter(Boolean),
        eatLess: ['sucuri', 'produse de patiserie', 'dulciuri concentrate'],
      },
      fats: {
        eatMore: pools.fats.slice(0, 4),
        eatSome: pools.fats.slice(4, 7),
        eatLess: ['margarină', 'uleiuri hidrogenate', 'sosuri dulci-grase'],
      },
      vegetablesRainbow: pools.vegetables.slice(0, 5),
      guideline: `Prioritizează alimentele potrivite stilului alimentar ${input.preferredEatingStyle} și contextului real al clientului. Exemplele trebuie să fie personalizate, nu reciclate între clienți.`,
    },
    adjustments: {
      title: 'Cum faci ajustări',
      paragraphs: [
        'Planul este un punct de start. Ajustările trebuie făcute după 2-4 săptămâni de aplicare consecventă.',
      ],
      rules: [
        'Dacă nu scade în greutate conform obiectivului, redu 200-250 kcal din carbohidrați și/sau grăsimi.',
        'Dacă nu crește masa musculară, adaugă 200-250 kcal din carbohidrați și/sau grăsimi.',
        'Dacă apare foame mare sau energie slabă, redistribuie carbohidrații în jurul antrenamentului.',
      ],
    },
    finalThoughts: {
      title: 'Gând final',
      paragraphs: [
        'Progresul real vine din obiceiuri repetitive și sustenabile.',
        'Alege câteva acțiuni simple, repetă-le bine și folosește datele din următoarele săptămâni pentru optimizare.',
      ],
    },
  };
}

function cleanJson(content: string): string {
  return content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

export async function generateNutritionReport(
  input: GenerateNutritionReportInput
): Promise<NutritionReportResult> {
  const mealsPerDay = getMealsPerDay(input);
  const styleConfig = getPlanStyleConfig(input.planStyle);
  const pools = buildIngredientPools(input);
  const antiRepeatSection = buildAntiRepeatPromptSection(input.generationContext);
  const languageInstruction = buildAiLanguageInstruction(normalizeLanguage(input.language));

  const prompt = `Ești un nutriționist senior și redactezi un raport complet, premium, branduit TrainerOS.org, inspirat din structura unui "Calorie, Macro and Portion Guide".

${languageInstruction}

Vreau un raport clar, practic și uman pentru clientul de mai jos. Raportul trebuie să includă următoarele secțiuni:
1. Introducere și cum folosește ghidul
2. Calcul și profil client
3. Ținte zilnice de porții pentru proteine, legume, carbohidrați și grăsimi
4. 6 idei de mese potrivite contextului clientului
5. Ghid de meal planning
6. Ghid de consistență și tracking
7. Notă pentru trackerul săptămânal
8. Alegeri alimentare: proteină / carbohidrați / grăsimi / legume
9. Reguli de ajustare
10. Încheiere motivațională, fără clișee

DATE CLIENT
- Nume client: ${input.clientName}
- Vârstă: ${input.age}
- Sex: ${input.sex}
- Greutate: ${input.weightKg} kg
- Înălțime: ${input.heightCm} cm
- Nivel activitate: ${input.activityLevel}
- Stil alimentar preferat: ${input.preferredEatingStyle}
- Obiectiv: ${input.objective}
- Greutate țintă: ${input.goalWeightKg || 'N/A'} kg
- Dată țintă: ${input.targetDate || 'N/A'}
- Note suplimentare: ${input.clientNotes || 'N/A'}

DATE NUTRIȚIONALE
- Calorii: ${input.calories}
- Proteină: ${input.proteinGrams} g
- Grăsimi: ${input.fatGrams} g
- Carbohidrați: ${input.carbsGrams} g
- Mese/zi: ${mealsPerDay}
- Distribuție macro: ${input.macroDistributionType}${input.customMacroDistribution ? ` | ${input.customMacroDistribution}` : ''}
- Trezire: ${input.wakeUpTime}
- Somn: ${input.sleepTime}
- Are antrenament: ${input.hasTraining ? 'Da' : 'Nu'}
- Ora antrenamentului: ${input.trainingTime || 'N/A'}
- Program de lucru: ${input.workProgram || 'Nespecificat'}
- Locații mese: ${input.mealLocations.join(', ')}
- Gătit: ${input.cookingLevel}
- Buget: ${input.foodBudget}
- Restricții: ${input.dietaryRestrictions.join(', ') || 'fără'}
- Alergii: ${input.allergiesDetails || 'N/A'}
- Preferințe / alimente excluse: ${input.excludedFoodsAndPreferences || 'N/A'}
- Stil plan: ${input.planStyle}

REGULI
- Răspunde exclusiv în limba cerută mai sus.
- Ton profesionist, cald, clar.
- Nu folosi markdown.
- Fii specific și util, fără umplutură.
- Ține cont de obiectiv, program, buget, restricții și contextul real al clientului.
- Pentru porțiile zilnice, exprimă atât porția pe zi, cât și pe masă.
- La alegeri alimentare, propune liste scurte și curate, nu liste infinite.
- La ajustări, oferă reguli practice, măsurabile.
- Stilul selectat de utilizator este "${styleConfig.label}" și TREBUIE să schimbe clar forma recomandărilor.
- ${styleConfig.summaryLine}
${styleConfig.promptRules.map((rule) => `- ${rule}`).join('\n')}
- Raportul trebuie să fie clar personalizat pentru acest client și să nu repete mecanic aceleași alimente ca în alte rapoarte.
- Folosește prioritar exemple alimentare potrivite acestui client:
  * Proteine: ${pools.proteins.join(', ')}
  * Carbohidrați: ${pools.carbs.join(', ')}
  * Grăsimi: ${pools.fats.join(', ')}
  * Legume: ${pools.vegetables.join(', ')}
  * Fructe: ${pools.fruit.join(', ')}
  * Variante rapide/utile pentru context: ${pools.convenience.join(', ')}
- Respectă strict restricțiile și alimentele excluse. Dacă un aliment nu se potrivește stilului sau preferințelor, nu-l include.
- Fă fiecare secțiune să reflecte profilul clientului: program, nivel de gătit, buget, locațiile în care mănâncă și obiectivul urmărit.

${antiRepeatSection}

Returnează DOAR JSON valid, cu structura exactă:
{
  "reportTitle": "string",
  "executiveSummary": "string",
  "introduction": ["string", "string"],
  "calculations": {
    "overview": "string",
    "aboutClient": ["string", "string"],
    "macroRatioText": "string",
    "calorieTargetText": "string",
    "goalText": "string"
  },
  "dailyPortions": [
    {
      "key": "protein",
      "title": "string",
      "perDay": "string",
      "perMeal": "string",
      "approximateGrams": "string",
      "whyItMatters": "string",
      "examples": ["string", "string", "string"]
    }
  ],
  "mealIdeas": [
    {
      "title": "string",
      "components": ["string", "string", "string"],
      "note": "string optional"
    }
  ],
  "mealPlanning": {
    "title": "string",
    "paragraphs": ["string", "string"],
    "bullets": ["string", "string", "string"]
  },
  "trackingConsistency": {
    "title": "string",
    "paragraphs": ["string", "string"],
    "bullets": ["string", "string", "string"],
    "targetConsistency": "string"
  },
  "weeklyTracker": {
    "intro": "string",
    "proteinPerDay": "string",
    "vegetablesPerDay": "string",
    "carbsPerDay": "string",
    "fatsPerDay": "string"
  },
  "foodChoices": {
    "protein": { "eatMore": ["string"], "eatSome": ["string"], "eatLess": ["string"] },
    "carbs": { "eatMore": ["string"], "eatSome": ["string"], "eatLess": ["string"] },
    "fats": { "eatMore": ["string"], "eatSome": ["string"], "eatLess": ["string"] },
    "vegetablesRainbow": ["string", "string", "string"],
    "guideline": "string"
  },
  "adjustments": {
    "title": "string",
    "paragraphs": ["string"],
    "rules": ["string", "string", "string"]
  },
  "finalThoughts": {
    "title": "string",
    "paragraphs": ["string", "string"]
  }
}`;

  try {
    const content =
      (await createGeminiText([{ role: 'user', content: prompt }], {
        temperature: 0.45,
        maxTokens: 3200,
      })) || '{}';
    const parsed = JSON.parse(cleanJson(content));
    const fallback = buildFallbackReport(input);

    return {
      reportTitle: parsed.reportTitle || fallback.reportTitle,
      executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
      introduction: Array.isArray(parsed.introduction) && parsed.introduction.length
        ? parsed.introduction
        : fallback.introduction,
      calculations: {
        overview: parsed?.calculations?.overview || fallback.calculations.overview,
        aboutClient: Array.isArray(parsed?.calculations?.aboutClient) && parsed.calculations.aboutClient.length
          ? parsed.calculations.aboutClient
          : fallback.calculations.aboutClient,
        macroRatioText: parsed?.calculations?.macroRatioText || fallback.calculations.macroRatioText,
        calorieTargetText: parsed?.calculations?.calorieTargetText || fallback.calculations.calorieTargetText,
        goalText: parsed?.calculations?.goalText || fallback.calculations.goalText,
      },
      dailyPortions: Array.isArray(parsed.dailyPortions) && parsed.dailyPortions.length
        ? parsed.dailyPortions
        : fallback.dailyPortions,
      mealIdeas: Array.isArray(parsed.mealIdeas) && parsed.mealIdeas.length ? parsed.mealIdeas : fallback.mealIdeas,
      mealPlanning: {
        title: parsed?.mealPlanning?.title || fallback.mealPlanning.title,
        paragraphs: Array.isArray(parsed?.mealPlanning?.paragraphs) && parsed.mealPlanning.paragraphs.length
          ? parsed.mealPlanning.paragraphs
          : fallback.mealPlanning.paragraphs,
        bullets: Array.isArray(parsed?.mealPlanning?.bullets) && parsed.mealPlanning.bullets.length
          ? parsed.mealPlanning.bullets
          : fallback.mealPlanning.bullets,
      },
      trackingConsistency: {
        title: parsed?.trackingConsistency?.title || fallback.trackingConsistency.title,
        paragraphs:
          Array.isArray(parsed?.trackingConsistency?.paragraphs) && parsed.trackingConsistency.paragraphs.length
            ? parsed.trackingConsistency.paragraphs
            : fallback.trackingConsistency.paragraphs,
        bullets: Array.isArray(parsed?.trackingConsistency?.bullets) && parsed.trackingConsistency.bullets.length
          ? parsed.trackingConsistency.bullets
          : fallback.trackingConsistency.bullets,
        targetConsistency:
          parsed?.trackingConsistency?.targetConsistency || fallback.trackingConsistency.targetConsistency,
      },
      weeklyTracker: {
        intro: parsed?.weeklyTracker?.intro || fallback.weeklyTracker.intro,
        proteinPerDay: parsed?.weeklyTracker?.proteinPerDay || fallback.weeklyTracker.proteinPerDay,
        vegetablesPerDay: parsed?.weeklyTracker?.vegetablesPerDay || fallback.weeklyTracker.vegetablesPerDay,
        carbsPerDay: parsed?.weeklyTracker?.carbsPerDay || fallback.weeklyTracker.carbsPerDay,
        fatsPerDay: parsed?.weeklyTracker?.fatsPerDay || fallback.weeklyTracker.fatsPerDay,
      },
      foodChoices: {
        protein: {
          eatMore:
            Array.isArray(parsed?.foodChoices?.protein?.eatMore) && parsed.foodChoices.protein.eatMore.length
              ? parsed.foodChoices.protein.eatMore
              : fallback.foodChoices.protein.eatMore,
          eatSome:
            Array.isArray(parsed?.foodChoices?.protein?.eatSome) && parsed.foodChoices.protein.eatSome.length
              ? parsed.foodChoices.protein.eatSome
              : fallback.foodChoices.protein.eatSome,
          eatLess:
            Array.isArray(parsed?.foodChoices?.protein?.eatLess) && parsed.foodChoices.protein.eatLess.length
              ? parsed.foodChoices.protein.eatLess
              : fallback.foodChoices.protein.eatLess,
        },
        carbs: {
          eatMore:
            Array.isArray(parsed?.foodChoices?.carbs?.eatMore) && parsed.foodChoices.carbs.eatMore.length
              ? parsed.foodChoices.carbs.eatMore
              : fallback.foodChoices.carbs.eatMore,
          eatSome:
            Array.isArray(parsed?.foodChoices?.carbs?.eatSome) && parsed.foodChoices.carbs.eatSome.length
              ? parsed.foodChoices.carbs.eatSome
              : fallback.foodChoices.carbs.eatSome,
          eatLess:
            Array.isArray(parsed?.foodChoices?.carbs?.eatLess) && parsed.foodChoices.carbs.eatLess.length
              ? parsed.foodChoices.carbs.eatLess
              : fallback.foodChoices.carbs.eatLess,
        },
        fats: {
          eatMore:
            Array.isArray(parsed?.foodChoices?.fats?.eatMore) && parsed.foodChoices.fats.eatMore.length
              ? parsed.foodChoices.fats.eatMore
              : fallback.foodChoices.fats.eatMore,
          eatSome:
            Array.isArray(parsed?.foodChoices?.fats?.eatSome) && parsed.foodChoices.fats.eatSome.length
              ? parsed.foodChoices.fats.eatSome
              : fallback.foodChoices.fats.eatSome,
          eatLess:
            Array.isArray(parsed?.foodChoices?.fats?.eatLess) && parsed.foodChoices.fats.eatLess.length
              ? parsed.foodChoices.fats.eatLess
              : fallback.foodChoices.fats.eatLess,
        },
        vegetablesRainbow:
          Array.isArray(parsed?.foodChoices?.vegetablesRainbow) && parsed.foodChoices.vegetablesRainbow.length
            ? parsed.foodChoices.vegetablesRainbow
            : fallback.foodChoices.vegetablesRainbow,
        guideline: parsed?.foodChoices?.guideline || fallback.foodChoices.guideline,
      },
      adjustments: {
        title: parsed?.adjustments?.title || fallback.adjustments.title,
        paragraphs: Array.isArray(parsed?.adjustments?.paragraphs) && parsed.adjustments.paragraphs.length
          ? parsed.adjustments.paragraphs
          : fallback.adjustments.paragraphs,
        rules: Array.isArray(parsed?.adjustments?.rules) && parsed.adjustments.rules.length
          ? parsed.adjustments.rules
          : fallback.adjustments.rules,
      },
      finalThoughts: {
        title: parsed?.finalThoughts?.title || fallback.finalThoughts.title,
        paragraphs: Array.isArray(parsed?.finalThoughts?.paragraphs) && parsed.finalThoughts.paragraphs.length
          ? parsed.finalThoughts.paragraphs
          : fallback.finalThoughts.paragraphs,
      },
    };
  } catch (error) {
    console.error('Nutrition report generation failed, using fallback report.', error);
    return buildFallbackReport(input);
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'client';
}

function ensurePageSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > bottomLimit) {
    doc.addPage();
    const nextPageNumber = (((doc as PDFKit.PDFDocument & { __trainerosPageNumber?: number }).__trainerosPageNumber) || 1) + 1;
    (doc as PDFKit.PDFDocument & { __trainerosPageNumber?: number }).__trainerosPageNumber = nextPageNumber;
    drawPageBackground(doc, nextPageNumber);
  }
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function getAssetPath(filename: string): string {
  return path.join(NUTRITION_ASSETS_DIR, filename);
}

function parseSvgAsset(content: string): SvgAsset | null {
  const viewBoxMatch = content.match(/viewBox="([^"]+)"/i);
  if (!viewBoxMatch) {
    return null;
  }

  const viewBox = viewBoxMatch[1]
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));

  if (viewBox.length !== 4 || viewBox.some((value) => Number.isNaN(value))) {
    return null;
  }

  const classFillMap = new Map<string, string>();
  const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const ruleRegex = /\.([a-z0-9_-]+)\s*\{[\s\S]*?fill:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*;[\s\S]*?\}/g;
    for (const match of styleMatch[1].matchAll(ruleRegex)) {
      classFillMap.set(match[1], match[2]);
    }
  }

  const resolveFill = (raw: string | undefined): string => {
    if (!raw) {
      return PDF_THEME.text;
    }

    if (raw.startsWith('#')) {
      return raw;
    }

    return classFillMap.get(raw.replace(/^cls-/, 'cls-')) || classFillMap.get(raw) || PDF_THEME.text;
  };

  const shapes: SvgShape[] = [];

  const pathRegex = /<path\b([^>]*)\/?>/gi;
  for (const match of content.matchAll(pathRegex)) {
    const attrs = match[1];
    const dMatch = attrs.match(/\sd="([^"]+)"/i);
    if (!dMatch) {
      continue;
    }
    const classMatch = attrs.match(/\sclass="([^"]+)"/i);
    const fillMatch = attrs.match(/\sfill="([^"]+)"/i);
    shapes.push({
      type: 'path',
      d: dMatch[1],
      fill: resolveFill(fillMatch?.[1] || classMatch?.[1]),
    });
  }

  const circleRegex = /<circle\b([^>]*)\/?>/gi;
  for (const match of content.matchAll(circleRegex)) {
    const attrs = match[1];
    const cx = Number(attrs.match(/\scx="([^"]+)"/i)?.[1]);
    const cy = Number(attrs.match(/\scy="([^"]+)"/i)?.[1]);
    const r = Number(attrs.match(/\sr="([^"]+)"/i)?.[1]);
    if ([cx, cy, r].some((value) => Number.isNaN(value))) {
      continue;
    }
    const classMatch = attrs.match(/\sclass="([^"]+)"/i);
    const fillMatch = attrs.match(/\sfill="([^"]+)"/i);
    shapes.push({
      type: 'circle',
      cx,
      cy,
      r,
      fill: resolveFill(fillMatch?.[1] || classMatch?.[1]),
    });
  }

  if (!shapes.length) {
    return null;
  }

  return {
    viewBox: viewBox as [number, number, number, number],
    shapes,
  };
}

async function loadSvgAsset(filename: string): Promise<SvgAsset | null> {
  const cached = svgAssetCache.get(filename);
  if (cached) {
    return cached;
  }

  const promise = fs
    .readFile(getAssetPath(filename), 'utf8')
    .then((content) => parseSvgAsset(content))
    .catch(() => null);

  svgAssetCache.set(filename, promise);
  return promise;
}

function remapIconColor(color: string): string {
  const normalized = color.toLowerCase();
  if (normalized === '#0f0409' || normalized === '#000000' || normalized === 'black') {
    return '#dce9f7';
  }
  if (normalized === '#d96299') {
    return PDF_THEME.accent;
  }
  return color;
}

function drawSvgIcon(
  doc: PDFKit.PDFDocument,
  icon: SvgAsset | null,
  x: number,
  y: number,
  size: number
): void {
  if (!icon) {
    return;
  }

  const [minX, minY, width, height] = icon.viewBox;
  const scale = size / Math.max(width, height);
  const offsetX = x + (size - width * scale) / 2;
  const offsetY = y + (size - height * scale) / 2;

  doc.save();
  doc.translate(offsetX, offsetY);
  doc.scale(scale);
  doc.translate(-minX, -minY);

  for (const shape of icon.shapes) {
    doc.fillColor(remapIconColor(shape.fill));
    if (shape.type === 'path') {
      doc.path(shape.d).fill();
    } else {
      doc.circle(shape.cx, shape.cy, shape.r).fill();
    }
  }

  doc.restore();
}

function drawPageBackground(doc: PDFKit.PDFDocument, pageNumber: number): void {
  const { width, height } = doc.page;

  doc.save();
  doc.rect(0, 0, width, height).fill(PDF_THEME.page);

  doc.fillOpacity(0.14).circle(width * 0.15, 92, 110).fill(PDF_THEME.accentBlue);
  doc.fillOpacity(0.11).circle(width * 0.82, 146, 130).fill(PDF_THEME.accent);
  doc.fillOpacity(0.07).circle(width * 0.8, height - 70, 150).fill(PDF_THEME.accentBlue);
  doc.fillOpacity(0.06).circle(width * 0.22, height - 120, 95).fill(PDF_THEME.accent);
  doc.fillOpacity(1);
  doc.restore();
}

function writeSectionTitle(
  doc: PDFKit.PDFDocument,
  options: {
    index: string;
    title: string;
    kicker?: string;
    icon?: SvgAsset | null;
  }
): void {
  ensurePageSpace(doc, 74);
  const top = doc.y;
  const left = doc.page.margins.left;

  doc.save();
  doc.roundedRect(left, top, 42, 42, 13).fill('#0f1d2d');
  doc.lineWidth(1).strokeColor('#24526b').roundedRect(left, top, 42, 42, 13).stroke();
  if (options.icon) {
    drawSvgIcon(doc, options.icon, left + 7, top + 7, 28);
  }
  doc.restore();

  doc.font('TrainerBold').fontSize(9).fillColor(PDF_THEME.accent).text(options.index, left + 14, top + 13);
  const textX = left + 58;
  if (options.kicker) {
    doc.font('TrainerBold').fontSize(9).fillColor(PDF_THEME.accent).text(options.kicker.toUpperCase(), textX, top + 2, {
      characterSpacing: 1.8,
    });
  }
  doc.font('TrainerBold').fontSize(18).fillColor(PDF_THEME.accent).text(options.title, textX, top + 14, {
    width: doc.page.width - doc.page.margins.right - textX,
  });
  const ruleY = Math.max(doc.y + 6, top + 44);
  doc.lineWidth(1.4).strokeColor('#18435c').moveTo(left, ruleY).lineTo(doc.page.width - doc.page.margins.right, ruleY).stroke();
  doc.y = ruleY + 12;
}

function measurePanelHeight(
  doc: PDFKit.PDFDocument,
  title: string,
  lines: string[],
  width: number,
  compact = false
): number {
  const paddingX = compact ? 14 : 18;
  const titleWidth = width - paddingX * 2;
  doc.font('TrainerBold').fontSize(compact ? 11 : 12);
  const titleHeight = doc.heightOfString(title, { width: titleWidth });
  doc.font('TrainerRegular').fontSize(10.5);
  const linesHeight = lines.reduce((sum, line) => sum + doc.heightOfString(line, { width: titleWidth, lineGap: 2 }), 0);
  return Math.max(compact ? 66 : 82, (compact ? 20 : 26) + titleHeight + linesHeight + Math.max(lines.length - 1, 0) * 4);
}

function drawPanel(
  doc: PDFKit.PDFDocument,
  options: {
    title: string;
    lines: string[];
    width?: number;
    background?: string;
    border?: string;
    titleColor?: string;
    textColor?: string;
    accentColor?: string;
    icon?: SvgAsset | null;
    compact?: boolean;
  }
): void {
  const width = options.width || doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const compact = Boolean(options.compact);
  const height = measurePanelHeight(doc, options.title, options.lines, width, compact);
  ensurePageSpace(doc, height + 14);
  const top = doc.y;
  const left = doc.page.margins.left;
  const paddingX = compact ? 14 : 18;

  doc.save();
  doc.roundedRect(left, top, width, height, compact ? 16 : 22).fill(options.background || PDF_THEME.panel);
  doc.lineWidth(1).strokeColor(options.border || PDF_THEME.border).roundedRect(left, top, width, height, compact ? 16 : 22).stroke();
  doc.roundedRect(left, top, 5, height, 3).fill(options.accentColor || PDF_THEME.accent);
  if (options.icon) {
    doc.roundedRect(left + 16, top + 14, 34, 34, 11).fill('#102235');
    drawSvgIcon(doc, options.icon, left + 20, top + 18, 26);
  }
  doc.restore();

  const textX = left + (options.icon ? 62 : paddingX);
  const textWidth = width - (textX - left) - paddingX;
  doc.font('TrainerBold').fontSize(compact ? 11 : 12).fillColor(options.titleColor || PDF_THEME.accent).text(options.title, textX, top + 14, {
    width: textWidth,
  });
  let cursorY = doc.y + 4;
  doc.font('TrainerRegular').fontSize(10.5).fillColor(options.textColor || PDF_THEME.muted);
  for (const line of options.lines) {
    doc.text(line, textX, cursorY, { width: textWidth, lineGap: 2 });
    cursorY = doc.y + 3;
  }
  doc.y = top + height + 10;
}

function drawParagraphBlock(doc: PDFKit.PDFDocument, paragraphs: string[]): void {
  doc.font('TrainerRegular').fontSize(10.8).fillColor(PDF_THEME.muted);
  for (const paragraph of paragraphs) {
    ensurePageSpace(doc, 42);
    doc.text(paragraph, doc.page.margins.left, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineGap: 4,
    });
    doc.moveDown(0.55);
  }
}

function drawBulletList(doc: PDFKit.PDFDocument, items: string[], color: string = PDF_THEME.muted): void {
  for (const item of items) {
    ensurePageSpace(doc, 24);
    const bulletY = doc.y + 6;
    doc.save();
    doc.circle(doc.page.margins.left + 6, bulletY, 2.5).fill(PDF_THEME.accent);
    doc.restore();
    doc.font('TrainerRegular').fontSize(10.5).fillColor(color).text(item, doc.page.margins.left + 18, doc.y, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 18,
      lineGap: 2,
    });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.4);
}

export async function createNutritionReportPdf(
  input: GenerateNutritionReportInput,
  report: NutritionReportResult
): Promise<NutritionReportPdfArtifact> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const hasLogo = await fileExists(LOGO_PATH);
  const [
    balancedPlateIcon,
    healthyEatingIcon,
    hydrationIcon,
    proteinIcon,
    fiberIcon,
    heartIcon,
    labelsIcon,
    supplementsIcon,
    portionControlIcon,
    mindfulEatingIcon,
    freshFruitsIcon,
    digestiveHealthIcon,
    mediterraneanDietIcon,
    omegaSourcesIcon,
    essentialMineralsIcon,
    immuneSupportIcon,
    lowSugarChoicesIcon,
  ] = await Promise.all([
    loadSvgAsset('Balanced_Plate.svg'),
    loadSvgAsset('Healthy_Eating.svg'),
    loadSvgAsset('Hydration_Station.svg'),
    loadSvgAsset('Protein_Power.svg'),
    loadSvgAsset('Fiber_Boost.svg'),
    loadSvgAsset('Heart_Healthy_Options.svg'),
    loadSvgAsset('Nutritional_Labels.svg'),
    loadSvgAsset('Nutritional_Supplements.svg'),
    loadSvgAsset('Portion_Control.svg'),
    loadSvgAsset('Mindful_Eating.svg'),
    loadSvgAsset('Fresh_Fruits.svg'),
    loadSvgAsset('Digestive_Health.svg'),
    loadSvgAsset('Mediterranean_Diet.svg'),
    loadSvgAsset('Omega_Sources.svg'),
    loadSvgAsset('Essential_Minerals.svg'),
    loadSvgAsset('Immune_Support.svg'),
    loadSvgAsset('Low_Sugar_Choices.svg'),
  ]);

  const filename = `${new Date().toISOString().slice(0, 10)}-${slugify(input.clientName)}-traineros-report.pdf`;
  const filePath = path.join(REPORTS_DIR, filename);
  const relativeUrl = `/uploads/nutrition-reports/${filename}`;
  const publicUrl = `${BACKEND_PUBLIC_URL.replace(/\/$/, '')}${relativeUrl}`;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: report.reportTitle,
      Author: 'TrainerOS.org',
      Subject: 'Raport nutrițional personalizat',
      Keywords: 'nutrition, macros, traineros, romanian',
    },
  });

  doc.registerFont('TrainerRegular', FONT_REGULAR);
  doc.registerFont('TrainerBold', FONT_BOLD);

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(filePath);

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);
    doc.pipe(stream);
    (doc as PDFKit.PDFDocument & { __trainerosPageNumber?: number }).__trainerosPageNumber = 1;
    drawPageBackground(doc, 1);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const heroTop = 54;
  const heroWidth = pageWidth;
  const heroLeft = doc.page.margins.left;
  const heroTextWidth = heroWidth - 40;
  const mealsPerDay = getMealsPerDay(input);
  const heroMetaText = `Pregătit pentru ${input.clientName} • ${input.calories} kcal • ${mealsPerDay} mese / zi`;

  doc.font('TrainerBold').fontSize(21);
  const titleTop = heroTop + 78;
  const titleHeight = doc.heightOfString(report.reportTitle, {
    width: heroTextWidth,
    lineGap: 3,
  });
  const metaTop = titleTop + titleHeight + 10;
  doc.font('TrainerRegular').fontSize(11);
  const metaHeight = doc.heightOfString(heroMetaText, { width: heroTextWidth });
  const summaryTop = metaTop + metaHeight + 12;
  doc.font('TrainerRegular').fontSize(10.5);
  const summaryHeight = doc.heightOfString(report.executiveSummary, {
    width: heroTextWidth,
    lineGap: 3,
  });
  const heroHeight = Math.max(238, summaryTop - heroTop + summaryHeight + 24);

    doc.save();
    doc.roundedRect(heroLeft, heroTop, heroWidth, heroHeight, 28).fill('#091321');
    doc.lineWidth(1).strokeColor('#1f4660').roundedRect(heroLeft, heroTop, heroWidth, heroHeight, 28).stroke();
    doc.fillOpacity(0.22).circle(heroLeft + heroWidth - 72, heroTop + 62, 86).fill(PDF_THEME.accent);
    doc.fillOpacity(0.16).circle(heroLeft + heroWidth - 34, heroTop + 150, 72).fill(PDF_THEME.accentBlue);
    doc.fillOpacity(1);
    doc.restore();

    if (hasLogo) {
      doc.image(LOGO_PATH, heroLeft + 18, heroTop + 18, { fit: [48, 48] });
    } else {
      doc.save();
      doc.roundedRect(heroLeft + 18, heroTop + 18, 48, 48, 14).fill('#0f1d2d');
      if (balancedPlateIcon) {
        drawSvgIcon(doc, balancedPlateIcon, heroLeft + 27, heroTop + 27, 30);
      }
      doc.restore();
    }

    doc.font('TrainerBold').fontSize(23).fillColor(PDF_THEME.text).text('TrainerOS', heroLeft + 76, heroTop + 22);
    doc.font('TrainerRegular').fontSize(9).fillColor(PDF_THEME.accent).text('NUTRITION CONSOLE REPORT', heroLeft + 76, heroTop + 48, {
      characterSpacing: 1.5,
    });
    doc.font('TrainerRegular').fontSize(9).fillColor(PDF_THEME.muted).text(new Date().toISOString().slice(0, 10), heroLeft + heroWidth - 90, heroTop + 24, {
      width: 72,
      align: 'right',
    });
    doc.font('TrainerBold').fontSize(21).fillColor(PDF_THEME.text);
    doc.text(report.reportTitle, heroLeft + 20, titleTop, {
      width: heroTextWidth,
      lineGap: 3,
    });
    doc.font('TrainerRegular').fontSize(11).fillColor(PDF_THEME.text).text(heroMetaText, heroLeft + 20, metaTop, {
      width: heroTextWidth,
    });
    doc.font('TrainerRegular').fontSize(10.5).fillColor(PDF_THEME.text).text(report.executiveSummary, heroLeft + 20, summaryTop, {
      width: heroTextWidth,
      lineGap: 3,
    });

    const statCardTop = heroTop + heroHeight + 14;
    const statGap = 10;
    const statWidth = (heroWidth - statGap * 2) / 3;
    const statCards = [
      { title: 'Calorie Target', value: `${input.calories} kcal`, accent: PDF_THEME.accent },
      { title: 'Macro Split', value: `P ${input.proteinGrams} • C ${input.carbsGrams} • F ${input.fatGrams}`, accent: PDF_THEME.accentBlue },
      { title: 'Execution Mode', value: `${mealsPerDay} mese • ${input.planStyle}`, accent: PDF_THEME.accentGold },
    ];
    for (const [index, stat] of statCards.entries()) {
      const x = heroLeft + index * (statWidth + statGap);
      doc.save();
      doc.roundedRect(x, statCardTop, statWidth, 54, 18).fill('#0d1828');
      doc.lineWidth(1).strokeColor('#1c3d54').roundedRect(x, statCardTop, statWidth, 54, 18).stroke();
      doc.roundedRect(x + 12, statCardTop + 14, 6, 26, 3).fill(stat.accent);
      doc.restore();
      doc.font('TrainerBold').fontSize(8.5).fillColor(PDF_THEME.muted).text(stat.title.toUpperCase(), x + 28, statCardTop + 12, {
        characterSpacing: 1.1,
      });
      doc.font('TrainerBold').fontSize(11.5).fillColor(PDF_THEME.text).text(stat.value, x + 28, statCardTop + 26, {
        width: statWidth - 40,
      });
    }

    doc.y = statCardTop + 72;

    writeSectionTitle(doc, {
      index: '01',
      title: 'Rezumat executiv',
      kicker: 'Intelligence Snapshot',
      icon: healthyEatingIcon,
    });
    drawPanel(doc, {
      title: 'Pe scurt',
      lines: [report.executiveSummary],
      background: '#0d1f24',
      border: '#1d5757',
      titleColor: PDF_THEME.accent,
      textColor: PDF_THEME.text,
      accentColor: PDF_THEME.accent,
    });
    drawParagraphBlock(doc, report.introduction);

    writeSectionTitle(doc, {
      index: '02',
      title: 'Profil și calcule',
      kicker: 'Client Diagnostics',
      icon: mediterraneanDietIcon,
    });
    drawPanel(doc, {
      title: 'Context metabolic',
      lines: [report.calculations.overview],
      background: PDF_THEME.panelAlt,
      accentColor: PDF_THEME.accentBlue,
      icon: labelsIcon,
    });
    drawPanel(doc, {
      title: 'Date client',
      lines: report.calculations.aboutClient,
      background: PDF_THEME.panel,
      accentColor: PDF_THEME.accent,
      icon: essentialMineralsIcon,
    });
    drawPanel(doc, {
      title: 'Ținte calculate',
      lines: [
        report.calculations.macroRatioText,
        report.calculations.calorieTargetText,
        report.calculations.goalText,
      ],
      background: '#0b1830',
      border: '#204c7a',
      titleColor: '#b3daff',
      textColor: PDF_THEME.text,
      accentColor: PDF_THEME.accentBlue,
      icon: heartIcon,
    });

    writeSectionTitle(doc, {
      index: '03',
      title: 'Porții zilnice recomandate',
      kicker: 'Portion Engine',
      icon: portionControlIcon,
    });
    const portionAccents = [PDF_THEME.accent, PDF_THEME.accentBlue, PDF_THEME.accentGold, PDF_THEME.accentRose];
    for (const [index, portion] of report.dailyPortions.entries()) {
      drawPanel(doc, {
        title: portion.title,
        lines: [
          `Pe zi: ${portion.perDay}`,
          `Pe masă: ${portion.perMeal}`,
          `Aprox.: ${portion.approximateGrams}`,
          `Rol: ${portion.whyItMatters}`,
          `Exemple: ${portion.examples.join(', ')}`,
        ],
        background: index % 2 === 0 ? PDF_THEME.panel : PDF_THEME.panelAlt,
        accentColor: portionAccents[index % portionAccents.length],
        icon:
          portion.key === 'protein'
            ? proteinIcon
            : portion.key === 'vegetables'
              ? fiberIcon
              : portion.key === 'carbs'
                ? balancedPlateIcon
                : heartIcon,
      });
    }

    writeSectionTitle(doc, {
      index: '04',
      title: 'Idei de mese',
      kicker: 'Meal Matrix',
      icon: freshFruitsIcon,
    });
    for (const [index, idea] of report.mealIdeas.entries()) {
      drawPanel(doc, {
        title: idea.title,
        lines: [...idea.components, ...(idea.note ? [idea.note] : [])],
        background: index % 2 === 0 ? '#111c25' : '#101923',
        border: '#21384a',
        accentColor: index % 2 === 0 ? PDF_THEME.accentGold : PDF_THEME.accentBlue,
        titleColor: PDF_THEME.text,
        textColor: PDF_THEME.text,
        icon: index % 2 === 0 ? mediterraneanDietIcon : mindfulEatingIcon,
      });
    }

    writeSectionTitle(doc, {
      index: '05',
      title: report.mealPlanning.title,
      kicker: 'Execution Layer',
      icon: hydrationIcon,
    });
    drawPanel(doc, {
      title: 'Principii de implementare',
      lines: report.mealPlanning.paragraphs,
      background: '#0d1828',
      accentColor: PDF_THEME.accentBlue,
    });
    drawBulletList(doc, report.mealPlanning.bullets);

    writeSectionTitle(doc, {
      index: '06',
      title: report.trackingConsistency.title,
      kicker: 'Consistency Logic',
      icon: supplementsIcon,
    });
    drawPanel(doc, {
      title: 'Consistență recomandată',
      lines: [...report.trackingConsistency.paragraphs, report.trackingConsistency.targetConsistency],
      background: '#161028',
      border: '#45306b',
      titleColor: '#f1eaff',
      textColor: PDF_THEME.text,
      accentColor: '#a78bfa',
      icon: lowSugarChoicesIcon,
    });
    drawBulletList(doc, report.trackingConsistency.bullets, PDF_THEME.text);

    writeSectionTitle(doc, {
      index: '07',
      title: 'Tracker săptămânal',
      kicker: 'Adherence Grid',
      icon: digestiveHealthIcon,
    });
    drawParagraphBlock(doc, [report.weeklyTracker.intro]);
    const trackerRows: Array<[string, string, string]> = [
      ['Proteine / zi', report.weeklyTracker.proteinPerDay, PDF_THEME.accent],
      ['Legume / zi', report.weeklyTracker.vegetablesPerDay, PDF_THEME.accentStrong],
      ['Carbohidrați / zi', report.weeklyTracker.carbsPerDay, PDF_THEME.accentBlue],
      ['Grăsimi / zi', report.weeklyTracker.fatsPerDay, PDF_THEME.accentGold],
    ];
    for (const [label, value, accent] of trackerRows) {
      drawPanel(doc, {
        title: label,
        lines: [value],
        background: PDF_THEME.panel,
        accentColor: accent,
        compact: true,
      });
    }
    ensurePageSpace(doc, 230);
    doc.font('TrainerBold').fontSize(11).fillColor(PDF_THEME.text).text('Foaie rapidă de bifat', doc.page.margins.left, doc.y);
    doc.moveDown(0.45);
    const days = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];
    for (const day of days) {
      ensurePageSpace(doc, 32);
      const top = doc.y;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.save();
      doc.roundedRect(doc.page.margins.left, top, width, 24, 10).fill('#0d1828');
      doc.lineWidth(1).strokeColor('#20384c').roundedRect(doc.page.margins.left, top, width, 24, 10).stroke();
      doc.restore();
      doc.font('TrainerBold').fontSize(10).fillColor(PDF_THEME.text).text(day, doc.page.margins.left + 10, top + 6);
      doc.font('TrainerRegular').fontSize(9.5).fillColor(PDF_THEME.text).text(
        'Proteine □ □ □   Legume □ □ □   Carbohidrați □ □ □   Grăsimi □ □ □',
        doc.page.margins.left + 92,
        top + 6
      );
      doc.y = top + 30;
    }

    writeSectionTitle(doc, {
      index: '08',
      title: 'Alegeri alimentare',
      kicker: 'Food Radar',
      icon: heartIcon,
    });
    const foodChoiceSections = [
      ['Proteine', report.foodChoices.protein, proteinIcon, PDF_THEME.accent],
      ['Carbohidrați', report.foodChoices.carbs, balancedPlateIcon, PDF_THEME.accentBlue],
      ['Grăsimi', report.foodChoices.fats, omegaSourcesIcon, PDF_THEME.accentGold],
    ] as const;
    for (const [title, group, icon, accent] of foodChoiceSections) {
      drawPanel(doc, {
        title,
        lines: [
          `Mănâncă mai des: ${group.eatMore.join(', ')}`,
          `Mănâncă moderat: ${group.eatSome.join(', ')}`,
          `Limitează: ${group.eatLess.join(', ')}`,
        ],
        background: PDF_THEME.panel,
        accentColor: accent,
        icon,
      });
    }
    drawPanel(doc, {
      title: 'Legume și varietate',
      lines: [
        `Culori recomandate: ${report.foodChoices.vegetablesRainbow.join(', ')}.`,
        report.foodChoices.guideline,
      ],
      background: '#0d1f24',
      border: '#1d5757',
      titleColor: PDF_THEME.text,
      textColor: PDF_THEME.text,
      accentColor: PDF_THEME.accent,
      icon: freshFruitsIcon,
    });

    writeSectionTitle(doc, {
      index: '09',
      title: report.adjustments.title,
      kicker: 'Optimization Rules',
      icon: labelsIcon,
    });
    drawPanel(doc, {
      title: 'Cum ajustezi',
      lines: report.adjustments.paragraphs,
      background: '#24160f',
      border: '#6b4930',
      titleColor: '#fff1dc',
      textColor: PDF_THEME.text,
      accentColor: PDF_THEME.accentGold,
      icon: essentialMineralsIcon,
    });
    drawBulletList(doc, report.adjustments.rules, PDF_THEME.text);

    writeSectionTitle(doc, {
      index: '10',
      title: report.finalThoughts.title,
      kicker: 'Closing Signal',
      icon: immuneSupportIcon,
    });
    drawPanel(doc, {
      title: 'Mesaj final',
      lines: report.finalThoughts.paragraphs,
      background: '#08121f',
      border: '#22506e',
      titleColor: PDF_THEME.text,
      textColor: PDF_THEME.text,
      accentColor: PDF_THEME.accent,
      icon: mindfulEatingIcon,
    });

    doc.end();
  });

  return {
    buffer: Buffer.concat(chunks),
    filename,
    filePath,
    publicUrl,
  };
}
