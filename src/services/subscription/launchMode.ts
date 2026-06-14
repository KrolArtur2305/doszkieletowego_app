// RevenueCat purchase flows are enabled for App Store builds.
export const PAYMENTS_ENABLED = true

// Temporary launch mode: AI remains open while paid plans are not active.
export const AI_OPEN_ACCESS = true

export function isLaunchPaymentsDisabled(): boolean {
  return !PAYMENTS_ENABLED
}

export function isSubscriptionPurchaseAvailable(): boolean {
  return PAYMENTS_ENABLED
}

export function isSubscriptionUiReadOnly(): boolean {
  return !PAYMENTS_ENABLED
}
