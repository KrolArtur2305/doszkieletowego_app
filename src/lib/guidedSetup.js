export const GUIDED_SETUP_VERSION = 'v1'
export const GUIDED_SETUP_STORAGE_KEY = 'buildiq_guided_setup_completed_v1'

export function readLocalGuidedSetupCompleted() {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(GUIDED_SETUP_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeLocalGuidedSetupCompleted(value = true) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(GUIDED_SETUP_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // no-op
  }
}
