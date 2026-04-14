import type { CustomerInfo, PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';
import type { SubscriptionPlanKey } from '../../config/subscriptionPlans';

export type RevenueCatSupportStatus =
  | 'ready'
  | 'unsupported-platform'
  | 'expo-go'
  | 'missing-api-key';

export type SubscriptionAccess = {
  currentPlan: SubscriptionPlanKey;
  isSubscriptionActive: boolean;
  hasAiAccess: boolean;
  hasPremiumAccess: boolean;
  activeEntitlementIds: string[];
};

export type SubscriptionSnapshot = {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  currentOffering: PurchasesOffering | null;
  access: SubscriptionAccess;
};
