import type { CustomerInfo } from 'react-native-purchases';

import { supabase } from '../../../lib/supabase';
import { getSubscriptionAccess } from './access';

function getLatestActiveExpirationDate(customerInfo: CustomerInfo | null): string | null {
  if (!customerInfo) return null;

  const activeEntitlements = Object.values(customerInfo.entitlements.active ?? {});
  const activeExpirationDates = activeEntitlements
    .map((entitlement) => entitlement.expirationDate)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return activeExpirationDates[0] ?? customerInfo.latestExpirationDate ?? null;
}

export async function syncRevenueCatProfile(
  customerInfo: CustomerInfo | null,
  userId?: string | null,
): Promise<void> {
  if (!customerInfo || !userId) return;

  const access = getSubscriptionAccess(customerInfo);
  const payload = access.isSubscriptionActive
    ? {
        plan: access.accessPlan,
        subscription_source: 'revenuecat',
        plan_expires_at: getLatestActiveExpirationDate(customerInfo),
      }
    : {
        plan: 'free',
        subscription_source: null,
        plan_expires_at: null,
      };

  const { error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('user_id', userId);

  if (error) throw error;
}
