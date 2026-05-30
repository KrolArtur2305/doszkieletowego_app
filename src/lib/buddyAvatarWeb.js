export const DEFAULT_BUDDY_AVATAR_ID = 'avatar1'
export const BUDDY_AVATAR_STORAGE_KEY = 'buildiq_buddy_avatar'

export const BUDDY_AVATAR_OPTIONS = [
  {
    id: 'avatar1',
    label: 'Domyslny',
    source: '/buddy_avatar.png',
    accent: '#25F0C8',
    ring: 'rgba(37,240,200,0.35)',
    glow: 'rgba(37,240,200,0.12)',
  },
  {
    id: 'avatar2',
    label: 'Chlodny',
    source: '/buddy_avatar.png',
    accent: '#60A5FA',
    ring: 'rgba(96,165,250,0.35)',
    glow: 'rgba(96,165,250,0.12)',
  },
  {
    id: 'avatar3',
    label: 'Energetyczny',
    source: '/buddy_avatar.png',
    accent: '#F472B6',
    ring: 'rgba(244,114,182,0.35)',
    glow: 'rgba(244,114,182,0.12)',
  },
]

export function normalizeBuddyAvatarId(value) {
  return BUDDY_AVATAR_OPTIONS.some((item) => item.id === value) ? value : DEFAULT_BUDDY_AVATAR_ID
}

export function getBuddyAvatarOption(value) {
  return BUDDY_AVATAR_OPTIONS.find((item) => item.id === normalizeBuddyAvatarId(value)) || BUDDY_AVATAR_OPTIONS[0]
}

export function getBuddyAvatarSource(value) {
  return getBuddyAvatarOption(value).source
}

export function getBuddyAvatarTheme(value) {
  const option = getBuddyAvatarOption(value)
  return {
    accent: option.accent,
    ring: option.ring,
    glow: option.glow,
  }
}

export function readLocalBuddyAvatarId() {
  if (typeof window === 'undefined') return DEFAULT_BUDDY_AVATAR_ID

  try {
    return normalizeBuddyAvatarId(window.localStorage.getItem(BUDDY_AVATAR_STORAGE_KEY))
  } catch {
    return DEFAULT_BUDDY_AVATAR_ID
  }
}

export function writeLocalBuddyAvatarId(value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(BUDDY_AVATAR_STORAGE_KEY, normalizeBuddyAvatarId(value))
  } catch {
    // no-op
  }
}
