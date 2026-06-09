import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './i18n';

export type UnitSystem = 'metric' | 'imperial';

export const UNITS_KEY = 'app_units';

const listeners = new Set<(units: UnitSystem) => void>();

export function defaultUnitsForLanguage(lang?: string | null): UnitSystem {
  const normalized = String(lang || '').toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) return 'imperial';
  return 'metric';
}

function isUnitSystem(value: string | null | undefined): value is UnitSystem {
  return value === 'metric' || value === 'imperial';
}

function getFallbackUnits(): UnitSystem {
  return defaultUnitsForLanguage(i18n.resolvedLanguage || i18n.language);
}

export async function getStoredUnits(): Promise<UnitSystem> {
  try {
    const stored = await AsyncStorage.getItem(UNITS_KEY);
    if (isUnitSystem(stored)) return stored;
  } catch {
    // ignore
  }
  return getFallbackUnits();
}

export async function setAppUnits(units: UnitSystem): Promise<void> {
  try {
    await AsyncStorage.setItem(UNITS_KEY, units);
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener(units));
}

export async function setUnitsForLanguage(lang: string): Promise<void> {
  await setAppUnits(defaultUnitsForLanguage(lang));
}

export function subscribeUnits(listener: (units: UnitSystem) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatAreaUnit(units: UnitSystem) {
  return units === 'imperial' ? 'sq ft' : 'm²';
}

export function formatLengthUnit(units: UnitSystem) {
  return units === 'imperial' ? 'ft' : 'm';
}

export function formatDegreeUnit() {
  return '°';
}

export function useUnits() {
  const [units, setUnits] = useState<UnitSystem>(() => getFallbackUnits());

  useEffect(() => {
    let alive = true;
    getStoredUnits().then((nextUnits) => {
      if (alive) setUnits(nextUnits);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => subscribeUnits(setUnits), []);

  return useMemo(() => ({ units, setUnits: setAppUnits }), [units]);
}
