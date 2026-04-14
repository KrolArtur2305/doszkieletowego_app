import { useEffect, useState } from 'react';
import type { CustomerInfo, PurchasesOfferings } from 'react-native-purchases';
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
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  access: SubscriptionAccess;
  supportStatus: RevenueCatSupportStatus;
  refresh: () => Promise<void>;
};

const FREE_ACCESS: SubscriptionAccess = {
  currentPlan: 'free',
  isSubscriptionActive: false,
  hasAiAccess: AI_OPEN_ACCESS,
  hasPremiumAccess: false,
  activeEntitlementIds: [],
};

export function useSubscription(): UseSubscriptionResult {
  const { session } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [access, setAccess] = useState<SubscriptionAccess>(FREE_ACCESS);
  const [supportStatus, setSupportStatus] = useState<RevenueCatSupportStatus>(
    getRevenueCatSupportStatus()
  );

  async function refresh() {
    setLoading(true);

    await configurePurchases();

    const [nextCustomerInfo, nextOfferings] = await Promise.all([
      getCustomerInfoSafe(),
      getOfferingsSafe(),
    ]);

    setCustomerInfo(nextCustomerInfo);
    setOfferings(nextOfferings);
    setAccess(getSubscriptionAccess(nextCustomerInfo));
    setSupportStatus(getRevenueCatSupportStatus());
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

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
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  return {
    loading,
    customerInfo,
    offerings,
    access,
    supportStatus,
    refresh,
  };
}
