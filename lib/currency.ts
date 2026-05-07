import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';

export type AppCurrency =
  | 'USD'
  | 'EUR'
  | 'PLN'
  | 'GBP'
  | 'CHF'
  | 'CAD'
  | 'AUD'
  | 'JPY'
  | 'CNY'
  | 'NOK';

export const CURRENCY_KEY = 'app_currency';

export const CURRENCY_OPTIONS: Array<{ code: AppCurrency; symbol: string }> = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'PLN', symbol: 'zł' },
  { code: 'GBP', symbol: '£' },
  { code: 'CHF', symbol: 'CHF' },
  { code: 'CAD', symbol: 'CA$' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'JPY', symbol: '¥' },
  { code: 'CNY', symbol: 'CN¥' },
  { code: 'NOK', symbol: 'kr' },
];

const listeners = new Set<(currency: AppCurrency) => void>();

export function defaultCurrencyForLanguage(lang?: string | null): AppCurrency {
  const base = String(lang || '').split('-')[0];
  if (base === 'pl') return 'PLN';
  if (base === 'de') return 'EUR';
  return 'USD';
}

function isAppCurrency(value: string | null | undefined): value is AppCurrency {
  return CURRENCY_OPTIONS.some((option) => option.code === value);
}

function getFallbackCurrency(): AppCurrency {
  return defaultCurrencyForLanguage(i18n.resolvedLanguage || i18n.language);
}

export async function getStoredCurrency(): Promise<AppCurrency> {
  try {
    const stored = await AsyncStorage.getItem(CURRENCY_KEY);
    if (isAppCurrency(stored)) return stored;
  } catch {
    // ignore
  }
  return getFallbackCurrency();
}

export async function setAppCurrency(currency: AppCurrency): Promise<void> {
  try {
    await AsyncStorage.setItem(CURRENCY_KEY, currency);
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener(currency));
}

export async function setCurrencyForLanguage(lang: string): Promise<void> {
  await setAppCurrency(defaultCurrencyForLanguage(lang));
}

export function subscribeCurrency(listener: (currency: AppCurrency) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatAppCurrency(value: number, locale: string, currency: AppCurrency) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function useCurrency() {
  const [currency, setCurrency] = useState<AppCurrency>(() => getFallbackCurrency());

  useEffect(() => {
    let alive = true;
    getStoredCurrency().then((nextCurrency) => {
      if (alive) setCurrency(nextCurrency);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => subscribeCurrency(setCurrency), []);

  return useMemo(() => ({ currency, setCurrency: setAppCurrency }), [currency]);
}
