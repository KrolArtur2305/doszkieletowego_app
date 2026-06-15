import { useEffect, useState } from 'react';
import type { CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
import i18n from '../lib/i18n';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { useSupabaseAuth } from './useSupabaseAuth';
import { getSubscriptionAccess } from '../src/services/subscription/access';
import { AI_OPEN_ACCESS } from '../src/services/subscription/launchMode';
import {
  configurePurchases,
  getCustomerInfoSafe,
  getOfferingsSafe,
  getRevenueCatSupportStatus,
} from '../src/services/subscription/revenuecat';
import type { RevenueCatSupportStatus, SubscriptionAccess } from '../src/services/subscription/types';

type UseSubscriptionResult = {
  loading: boolean;
  error: string | null;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  access: SubscriptionAccess;
  supportStatus: RevenueCatSupportStatus;
  refresh: () => Promise<void>;
};

const FREE_ACCESS: SubscriptionAccess = {
  currentPlan: 'free',
  accessPlan: 'free',
  isSubscriptionActive: false,
  isTrialActive: false,
  trialEndsAt: null,
  hasAiAccess: AI_OPEN_ACCESS,
  hasPremiumAccess: false,
  aiMessagesPerDayLimit: null,
  activeEntitlementIds: [],
};

export function useSubscription(): UseSubscriptionResult {
  const { session } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [access, setAccess] = useState<SubscriptionAccess>(FREE_ACCESS);
  const [supportStatus, setSupportStatus] = useState<RevenueCatSupportStatus>(
    getRevenueCatSupportStatus()
  );

  async function refresh() {
    setLoading(true);
    setError(null);

    try {
      await configurePurchases();

      const [nextCustomerInfo, nextOfferings] = await Promise.all([
        getCustomerInfoSafe(),
        getOfferingsSafe(),
      ]);

      setCustomerInfo(nextCustomerInfo);
      setOfferings(nextOfferings);
      setAccess(getSubscriptionAccess(nextCustomerInfo));
      setSupportStatus(getRevenueCatSupportStatus());
    } catch (e) {
      setCustomerInfo(null);
      setOfferings(null);
      setAccess(FREE_ACCESS);
      setSupportStatus(getRevenueCatSupportStatus());
      setError(getFriendlyErrorMessage(e, i18n.t.bind(i18n), 'subscription:errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        await configurePurchases();

        const [nextCustomerInfo, nextOfferings] = await Promise.all([
          getCustomerInfoSafe(),
          getOfferingsSafe(),
        ]);

        if (!alive) return;

        setCustomerInfo(nextCustomerInfo);
        setOfferings(nextOfferings);
        setAccess(getSubscriptionAccess(nextCustomerInfo));
        setSupportStatus(getRevenueCatSupportStatus());
      } catch (e) {
        if (!alive) return;

        setCustomerInfo(null);
        setOfferings(null);
        setAccess(FREE_ACCESS);
        setSupportStatus(getRevenueCatSupportStatus());
        setError(getFriendlyErrorMessage(e, i18n.t.bind(i18n), 'subscription:errors.loadFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  return {
    loading,
    error,
    customerInfo,
    offerings,
    access,
    supportStatus,
    refresh,
  };
}
