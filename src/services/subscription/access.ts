import type { CustomerInfo } from 'react-native-purchases';
import { publicConfig } from '../../../lib/supabase';
import {
  AI_OPEN_ACCESS,
  isLaunchPaymentsDisabled,
  isSubscriptionPurchaseAvailable,
} from './launchMode';
import type { SubscriptionAccess } from './types';

function getActiveEntitlementIds(customerInfo: CustomerInfo | null): string[] {
  if (!customerInfo) return [];
  return Object.keys(customerInfo.entitlements.active ?? {});
}

export function getSubscriptionAccess(customerInfo: CustomerInfo | null): SubscriptionAccess {
  if (isLaunchPaymentsDisabled() || !isSubscriptionPurchaseAvailable()) {
    return {
      currentPlan: 'free',
      isSubscriptionActive: false,
      hasPremiumAccess: false,
      hasAiAccess: AI_OPEN_ACCESS,
      activeEntitlementIds: [],
    };
  }

  const activeEntitlementIds = getActiveEntitlementIds(customerInfo);
  const hasAnyActiveEntitlement = activeEntitlementIds.length > 0;
  const standardEntitlementId = publicConfig.revenueCat.entitlements.standard;
  const proEntitlementId = publicConfig.revenueCat.entitlements.pro;

  const hasProEntitlement =
    !!proEntitlementId && activeEntitlementIds.includes(proEntitlementId);
  const hasStandardEntitlement =
    !!standardEntitlementId && activeEntitlementIds.includes(standardEntitlementId);

  const currentPlan = hasProEntitlement
    ? 'pro'
    : hasStandardEntitlement || hasAnyActiveEntitlement
    ? 'standard'
    : 'free';

  return {
    currentPlan,
    isSubscriptionActive: currentPlan !== 'free',
    hasPremiumAccess: currentPlan !== 'free',
    hasAiAccess: currentPlan === 'pro',
    activeEntitlementIds,
  };
}
