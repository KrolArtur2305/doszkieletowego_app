// Pre-release guard: keep RevenueCat purchase flows disabled until store products,
// webhook sync, and review-ready subscription UI are configured end to end.
export const PAYMENTS_ENABLED = false

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
