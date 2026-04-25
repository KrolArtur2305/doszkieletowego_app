export const PAYMENTS_ENABLED = false
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
