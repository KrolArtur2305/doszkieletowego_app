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
  getLastOfferingsDiagnostics,
  getOfferingsSafe,
  getRevenueCatSupportStatus,
} from '../src/services/subscription/revenuecat';
import { syncRevenueCatProfile } from '../src/services/subscription/profileSync';
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
  hasBudgetScannerAccess: false,
  budgetScannerScansPerMonth: 0,
  activeEntitlementIds: [],
};

export function useSubscription(): UseSubscriptionResult {
  const { session } = useSupabaseAuth();
  const supportStatus = getRevenueCatSupportStatus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [access, setAccess] = useState<SubscriptionAccess>(FREE_ACCESS);
  const [currentSupportStatus, setCurrentSupportStatus] = useState<RevenueCatSupportStatus>(supportStatus);

  const shouldUseRevenueCat = supportStatus === 'ready';

  function resolveOfferingsError(nextOfferings: PurchasesOfferings | null): string | null {
    const diagnostics = getLastOfferingsDiagnostics();
    if (!nextOfferings) {
      const reason = diagnostics?.error?.message ?? diagnostics?.supportStatus ?? null;
      return reason
        ? i18n.t('subscription:paywall.productsErrorWithReason', { reason })
        : i18n.t('subscription:paywall.productsError');
    }

    if (!nextOfferings.current) {
      return i18n.t('subscription:paywall.productsErrorWithReason', {
        reason: 'RevenueCat getOfferings() returned no current offering.',
      });
    }

    if ((nextOfferings.current.availablePackages ?? []).length === 0) {
      return i18n.t('subscription:paywall.productsErrorWithReason', {
        reason: 'RevenueCat current offering has no available packages.',
      });
    }

    return null;
  }

  async function refresh() {
    setLoading(true);
    setError(null);

    if (!shouldUseRevenueCat) {
      setCustomerInfo(null);
      setOfferings(null);
      setAccess(FREE_ACCESS);
      setCurrentSupportStatus(supportStatus);
      setLoading(false);
      return;
    }

    try {
      await configurePurchases();

      const [nextCustomerInfo, nextOfferings] = await Promise.all([
        getCustomerInfoSafe(),
        getOfferingsSafe(),
      ]);
      const offeringsError = resolveOfferingsError(nextOfferings);
      await syncRevenueCatProfile(nextCustomerInfo, session?.user?.id).catch((syncError) => {
        console.warn('[RevenueCat] profile sync failed:', syncError);
      });

      setCustomerInfo(nextCustomerInfo);
      setOfferings(nextOfferings);
      setAccess(getSubscriptionAccess(nextCustomerInfo));
      setCurrentSupportStatus(getRevenueCatSupportStatus());
      setError(offeringsError);
    } catch (e) {
      setCustomerInfo(null);
      setOfferings(null);
      setAccess(FREE_ACCESS);
      setCurrentSupportStatus(getRevenueCatSupportStatus());
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

      if (!shouldUseRevenueCat) {
        if (!alive) return;
        setCustomerInfo(null);
        setOfferings(null);
        setAccess(FREE_ACCESS);
        setCurrentSupportStatus(supportStatus);
        setLoading(false);
        return;
      }

      try {
        await configurePurchases();

        const [nextCustomerInfo, nextOfferings] = await Promise.all([
          getCustomerInfoSafe(),
          getOfferingsSafe(),
        ]);
        const offeringsError = resolveOfferingsError(nextOfferings);
        await syncRevenueCatProfile(nextCustomerInfo, session?.user?.id).catch((syncError) => {
          console.warn('[RevenueCat] profile sync failed:', syncError);
        });

        if (!alive) return;

        setCustomerInfo(nextCustomerInfo);
        setOfferings(nextOfferings);
        setAccess(getSubscriptionAccess(nextCustomerInfo));
        setCurrentSupportStatus(getRevenueCatSupportStatus());
        setError(offeringsError);
      } catch (e) {
        if (!alive) return;

        setCustomerInfo(null);
        setOfferings(null);
        setAccess(FREE_ACCESS);
        setCurrentSupportStatus(getRevenueCatSupportStatus());
        setError(getFriendlyErrorMessage(e, i18n.t.bind(i18n), 'subscription:errors.loadFailed'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [session?.user?.id, shouldUseRevenueCat, supportStatus]);

  return {
    loading,
    error,
    customerInfo,
    offerings,
    access,
    supportStatus: currentSupportStatus,
    refresh,
  };
}
