export const PAYMENTS_ENABLED = false
export const AI_OPEN_ACCESS = true

export function isLaunchPaymentsDisabled(): boolean {
  return !PAYMENTS_ENABLED
}
