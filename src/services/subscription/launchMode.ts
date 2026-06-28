// RevenueCat purchase flows are enabled for App Store builds.
export const PAYMENTS_ENABLED = true

// Temporary launch mode: keep false when plan limits should be enforced.
export const AI_OPEN_ACCESS = false

export function isLaunchPaymentsDisabled(): boolean {
  return !PAYMENTS_ENABLED
}

export function isSubscriptionPurchaseAvailable(): boolean {
  return PAYMENTS_ENABLED
}

export function isSubscriptionUiReadOnly(): boolean {
  return !PAYMENTS_ENABLED
}
