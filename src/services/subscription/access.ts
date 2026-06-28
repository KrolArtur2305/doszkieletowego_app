import type { CustomerInfo } from 'react-native-purchases';
import { EXPERT_PLAN_KEY, FREE_TRIAL_PLAN_KEY, PRO_PLAN_KEY } from '../../config/subscriptionPlans';
import { publicConfig } from '../../../lib/supabase';
import {
  AI_OPEN_ACCESS,
  isLaunchPaymentsDisabled,
  isSubscriptionPurchaseAvailable,
} from './launchMode';
import type { SubscriptionAccess } from './types';

type RevenueCatEntitlementMap = {
  pro: string | null;
  expert: string | null;
};

function getActiveEntitlementIds(customerInfo: CustomerInfo | null): string[] {
  if (!customerInfo) return [];
  return Object.keys(customerInfo.entitlements.active ?? {});
}

function getConfiguredEntitlementMap(): RevenueCatEntitlementMap {
  return {
    pro: publicConfig.revenueCat.entitlements.pro,
    expert: publicConfig.revenueCat.entitlements.expert,
  };
}

function getActiveTrialEndsAt(customerInfo: CustomerInfo | null): string | null {
  if (!customerInfo) return null;

  for (const entitlement of Object.values(customerInfo.entitlements.active ?? {})) {
    const periodType = String((entitlement as any).periodType ?? '').toLowerCase();
    const expirationDate = (entitlement as any).expirationDate as string | null | undefined;
    if (periodType === 'trial' && expirationDate) return expirationDate;
  }

  return null;
}

function mapEntitlementsToPlan(
  activeEntitlementIds: string[],
  entitlements: RevenueCatEntitlementMap,
): SubscriptionAccess['currentPlan'] {
  const normalizedIds = activeEntitlementIds.map((id) => id.trim().toLowerCase());
  const hasExpertEntitlement =
    (!!entitlements.expert && activeEntitlementIds.includes(entitlements.expert)) ||
    normalizedIds.some((id) => id.includes('expert'));
  if (hasExpertEntitlement) return EXPERT_PLAN_KEY;

  const hasProEntitlement =
    (!!entitlements.pro && activeEntitlementIds.includes(entitlements.pro)) ||
    normalizedIds.some((id) => id.includes('pro'));
  if (hasProEntitlement) return PRO_PLAN_KEY;

  // Conservative fallback for future RevenueCat setup mistakes: any active
  // entitlement grants paid access, but not Expert-only access.
  if (activeEntitlementIds.length > 0) return PRO_PLAN_KEY;

  return 'free';
}

export function getSubscriptionAccess(customerInfo: CustomerInfo | null): SubscriptionAccess {
  if (isLaunchPaymentsDisabled() || !isSubscriptionPurchaseAvailable()) {
    return {
      currentPlan: 'free',
      accessPlan: 'free',
      isSubscriptionActive: false,
      isTrialActive: false,
      trialEndsAt: null,
      hasPremiumAccess: false,
      hasAiAccess: AI_OPEN_ACCESS,
      aiMessagesPerDayLimit: null,
      activeEntitlementIds: [],
    };
  }

  const activeEntitlementIds = getActiveEntitlementIds(customerInfo);
  const mappedPlan = mapEntitlementsToPlan(
    activeEntitlementIds,
    getConfiguredEntitlementMap(),
  );
  const trialEndsAt = getActiveTrialEndsAt(customerInfo);
  const isTrialActive = !!trialEndsAt && mappedPlan === EXPERT_PLAN_KEY;
  const currentPlan = isTrialActive ? FREE_TRIAL_PLAN_KEY : mappedPlan;
  const accessPlan = currentPlan;

  return {
    currentPlan,
    accessPlan,
    isSubscriptionActive: accessPlan !== 'free',
    isTrialActive,
    trialEndsAt,
    hasPremiumAccess: accessPlan === PRO_PLAN_KEY || accessPlan === EXPERT_PLAN_KEY,
    hasAiAccess: accessPlan !== 'free',
    aiMessagesPerDayLimit:
      accessPlan === 'free'
        ? 0
        : accessPlan === FREE_TRIAL_PLAN_KEY
          ? 5
          : accessPlan === PRO_PLAN_KEY
            ? 20
            : 50,
    activeEntitlementIds,
  };
}
