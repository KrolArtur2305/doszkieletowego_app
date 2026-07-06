const AMOUNT_CURRENCY_PATTERN = /[^\d.,-]/g;

function normalizeSeparators(value: string) {
  const compact = value.replace(/\s+/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');

  if (lastComma === -1 && lastDot === -1) {
    return compact;
  }

  if (lastComma > lastDot) {
    return compact.replace(/\./g, '').replace(',', '.');
  }

  return compact.replace(/,/g, '');
}

export function parseLooseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();
  if (!raw) return null;

  const cleaned = raw.replace(AMOUNT_CURRENCY_PATTERN, '');
  const normalized = normalizeSeparators(cleaned);
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

export function formatLooseAmount(value: unknown): string {
  const parsed = parseLooseAmount(value);
  if (parsed === null) return '';
  return String(parsed);
}
