import type { TFunction } from 'i18next';

type SuggestionLike = {
  expense_name?: string | null;
  expense_name_key?: string | null;
  expense_key?: string | null;
};

const humanizeKey = (rawKey: string) => {
  const trimmed = String(rawKey ?? '').trim();
  if (!trimmed) return 'Expense';

  const leaf = trimmed.split('.').pop()?.split('/').pop() ?? trimmed;
  const spaced = leaf
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) return 'Expense';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const POLISH_SUGGESTION_NAMES: Record<string, string> = {
  'drzwi zewnetrzne': 'drzwi zewnętrzne',
  'drzwi wewnetrzne': 'drzwi wewnętrzne',
  'gladz': 'gładź',
  'izolacja fundamentow': 'izolacja fundamentów',
  'izolacja pod plyte': 'izolacja pod płytę',
  'kanalizacja podposadzkowa': 'kanalizacja podposadzkowa',
  'konstrukcja scian': 'konstrukcja ścian',
  'material elewacyjny': 'materiał elewacyjny',
  'materialy instalacyjne': 'materiały instalacyjne',
  'membrana wiatroizolacyjna': 'membrana wiatroizolacyjna',
  'obrobki blacharskie': 'obróbki blacharskie',
  'osprzet elektryczny': 'osprzęt elektryczny',
  'parapety wewnetrzne': 'parapety wewnętrzne',
  'pokrycie dachowe': 'pokrycie dachowe',
  'przewody elektryczne': 'przewody elektryczne',
  'plyty g-k': 'płyty g-k',
  'plyty konstrukcyjne': 'płyty konstrukcyjne',
  'rekuperacja': 'rekuperacja',
  'rynny i obrobki': 'rynny i obróbki',
  'stal zbrojeniowa': 'stal zbrojeniowa',
  'styropian': 'styropian',
  'szpachla': 'szpachla',
  'tynki': 'tynki',
  'welna mineralna': 'wełna mineralna',
  'wkrety konstrukcyjne': 'wkręty konstrukcyjne',
  'wylewki': 'wylewki',
  'zaprawa murarska': 'zaprawa murarska'};

const restorePolishSuggestionName = (value: string) => {
  const key = value.trim().toLowerCase();
  return POLISH_SUGGESTION_NAMES[key] ?? value;
};

export const getSuggestionDisplayName = (t: TFunction, suggestion: SuggestionLike) => {
  const nameKey = String(suggestion.expense_name_key ?? '').trim();
  if (nameKey) {
    const translated = String(t(nameKey) ?? '').trim();
    if (translated && translated !== nameKey && !translated.startsWith('budgetSuggestions.')) {
      return translated;
    }
  }

  const explicitName = String(suggestion.expense_name ?? '').trim();
  if (explicitName) return restorePolishSuggestionName(explicitName);

  const expenseKey = String(suggestion.expense_key ?? '').trim();
  return humanizeKey(expenseKey || nameKey || 'expense');
};
