import type { CustomerInfo, PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';
import type { SubscriptionPlanKey } from '../../config/subscriptionPlans';

export type RevenueCatSupportStatus =
  | 'ready'
  | 'payments-disabled'
  | 'unsupported-platform'
  | 'expo-go'
  | 'missing-api-key';

export type SubscriptionAccess = {
  currentPlan: SubscriptionPlanKey;
  accessPlan: SubscriptionPlanKey;
  isSubscriptionActive: boolean;
  isTrialActive: boolean;
  trialEndsAt: string | null;
  hasAiAccess: boolean;
  hasPremiumAccess: boolean;
  aiMessagesPerDayLimit: number | null;
  activeEntitlementIds: string[];
};

export type SubscriptionSnapshot = {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  currentOffering: PurchasesOffering | null;
  access: SubscriptionAccess;
};
