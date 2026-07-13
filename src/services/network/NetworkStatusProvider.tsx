import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, View } from 'react-native';
import * as Network from 'expo-network';

import { colors, radius, spacing, typography } from '../../ui/theme';

type NetworkStatus = {
  isOnline: boolean | null;
  isInternetReachable: boolean | null;
  type: Network.NetworkStateType | null;
  lastCheckedAt: number | null;
  refresh: () => Promise<void>;
};

const NetworkStatusContext = createContext<NetworkStatus>({
  isOnline: null,
  isInternetReachable: null,
  type: null,
  lastCheckedAt: null,
  refresh: async () => undefined,
});

const POLL_INTERVAL_MS = 15000;

function resolveIsOnline(state: Network.NetworkState | null): boolean | null {
  if (!state) return null;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  if (state.isConnected === true || state.isInternetReachable === true) return true;
  return null;
}

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [networkState, setNetworkState] = useState<Network.NetworkState | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextState = await Network.getNetworkStateAsync();
      setNetworkState(nextState);
      setLastCheckedAt(Date.now());
    } catch {
      setNetworkState((prev) => prev ?? {
        type: Network.NetworkStateType.UNKNOWN,
        isConnected: false,
        isInternetReachable: false,
      });
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [refresh]);

  const value = useMemo<NetworkStatus>(() => ({
    isOnline: resolveIsOnline(networkState),
    isInternetReachable: typeof networkState?.isInternetReachable === 'boolean'
      ? networkState.isInternetReachable
      : null,
    type: networkState?.type ?? null,
    lastCheckedAt,
    refresh,
  }), [lastCheckedAt, networkState, refresh]);

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
      <OfflineBanner status={value} />
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  return useContext(NetworkStatusContext);
}

export function useOnlineActionGuard() {
  const status = useNetworkStatus();

  return useCallback((message = 'Ta funkcja wymaga internetu. Sprawdź połączenie i spróbuj ponownie.') => {
    if (status.isOnline !== false) return true;

    Alert.alert('Brak internetu', message);
    return false;
  }, [status.isOnline]);
}

function OfflineBanner({ status }: { status: NetworkStatus }) {
  if (status.isOnline !== false) return null;

  const message = status.isInternetReachable === false
    ? 'Brak internetu. Część funkcji jest niedostępna.'
    : 'Połączenie jest niestabilne. Spróbujemy ponownie automatycznie.';

  return (
    <View pointerEvents="none" style={styles.bannerWrap}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    zIndex: 9999,
    alignItems: 'center',
  },
  banner: {
    maxWidth: 520,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  bannerText: {
    ...typography.meta,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '800',
  },
});
