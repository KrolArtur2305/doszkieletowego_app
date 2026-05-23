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

export const getSuggestionDisplayName = (t: TFunction, suggestion: SuggestionLike) => {
  const explicitName = String(suggestion.expense_name ?? '').trim();
  if (explicitName) return explicitName;

  const nameKey = String(suggestion.expense_name_key ?? '').trim();
  if (nameKey) {
    const translated = String(t(nameKey, { defaultValue: '' }) ?? '').trim();
    if (translated && translated !== nameKey && !translated.startsWith('budgetSuggestions.')) {
      return translated;
    }
  }

  const expenseKey = String(suggestion.expense_key ?? '').trim();
  return humanizeKey(expenseKey || nameKey || 'expense');
};
