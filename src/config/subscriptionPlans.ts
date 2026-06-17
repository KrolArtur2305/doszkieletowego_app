export type SubscriptionPlanKey = 'free' | 'free_trial' | 'pro' | 'expert'

export type SubscriptionFeatureKey =
  | 'photos'
  | 'docs'
  | 'expenses'
  | 'tasks'
  | 'model3d'
  | 'ai'
  | 'aiMessagesPerDay'

export type SubscriptionPlanDefinition = {
  key: SubscriptionPlanKey
  nameKey: string
  descKey: string
  // Temporary marketing copy only. Store pricing must come from RevenueCat/Store offerings.
  monthlyPrice: number | null
  // Temporary marketing copy only. Store pricing must come from RevenueCat/Store offerings.
  yearlyPrice: number | null
  color: string
  glowColor: string
  popular: boolean
  features: {
    photos: number | 'unlimited'
    docs: number | 'unlimited'
    expenses: number | 'unlimited'
    tasks: number | 'unlimited'
    model3d: boolean
    ai: boolean
    aiMessagesPerDay: number | 'unlimited'
  }
}

export const FREE_PLAN_KEY: SubscriptionPlanKey = 'free'
export const FREE_TRIAL_PLAN_KEY: SubscriptionPlanKey = 'free_trial'
export const PRO_PLAN_KEY: SubscriptionPlanKey = 'pro'
export const EXPERT_PLAN_KEY: SubscriptionPlanKey = 'expert'
export const SUBSCRIPTION_PLAN_ORDER: SubscriptionPlanKey[] = ['free', 'free_trial', 'pro', 'expert']

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanKey, SubscriptionPlanDefinition> = {
  free: {
    key: 'free',
    nameKey: 'plans.free.name',
    descKey: 'plans.free.desc',
    monthlyPrice: null,
    yearlyPrice: null,
    color: 'rgba(255,255,255,0.06)',
    glowColor: 'rgba(255,255,255,0.10)',
    popular: false,
    features: {
      photos: 20,
      docs: 5,
      expenses: 5,
      tasks: 15,
      model3d: false,
      ai: false,
      aiMessagesPerDay: 0,
    },
  },
  free_trial: {
    key: 'free_trial',
    nameKey: 'plans.free_trial.name',
    descKey: 'plans.free_trial.desc',
    monthlyPrice: null,
    yearlyPrice: null,
    color: 'rgba(25,112,92,0.14)',
    glowColor: 'rgba(25,112,92,0.35)',
    popular: true,
    features: {
      photos: 'unlimited',
      docs: 'unlimited',
      expenses: 'unlimited',
      tasks: 'unlimited',
      model3d: true,
      ai: true,
      aiMessagesPerDay: 'unlimited',
    },
  },
  pro: {
    key: 'pro',
    nameKey: 'plans.pro.name',
    descKey: 'plans.pro.desc',
    monthlyPrice: null,
    yearlyPrice: null,
    color: 'rgba(37,240,200,0.08)',
    glowColor: 'rgba(37,240,200,0.40)',
    popular: false,
    features: {
      photos: 100,
      docs: 25,
      expenses: 'unlimited',
      tasks: 'unlimited',
      model3d: true,
      ai: true,
      aiMessagesPerDay: 20,
    },
  },
  expert: {
    key: 'expert',
    nameKey: 'plans.expert.name',
    descKey: 'plans.expert.desc',
    monthlyPrice: null,
    yearlyPrice: null,
    color: 'rgba(37,240,200,0.08)',
    glowColor: 'rgba(37,240,200,0.40)',
    popular: false,
    features: {
      photos: 'unlimited',
      docs: 'unlimited',
      expenses: 'unlimited',
      tasks: 'unlimited',
      model3d: true,
      ai: true,
      aiMessagesPerDay: 'unlimited',
    },
  },
}

export const SUBSCRIPTION_PLAN_LIST = SUBSCRIPTION_PLAN_ORDER.map((key) => SUBSCRIPTION_PLANS[key])

export function normalizeStoredPlanKey(plan: unknown): SubscriptionPlanKey {
  const value = String(plan ?? '').trim().toLowerCase()
  if (value === 'demo') return FREE_TRIAL_PLAN_KEY
  if (value === 'pro_plus') return EXPERT_PLAN_KEY
  if (value === FREE_PLAN_KEY || value === FREE_TRIAL_PLAN_KEY || value === PRO_PLAN_KEY || value === EXPERT_PLAN_KEY) {
    return value as SubscriptionPlanKey
  }
  return FREE_PLAN_KEY
}

export function isExpertEquivalentPlan(plan: unknown): boolean {
  const normalized = String(plan ?? '').trim().toLowerCase()
  return normalized === EXPERT_PLAN_KEY || normalized === 'pro_plus'
}

export function getPlansWithFeature(feature: SubscriptionFeatureKey): SubscriptionPlanKey[] {
  return SUBSCRIPTION_PLAN_ORDER.filter((key) => SUBSCRIPTION_PLANS[key].features[feature])
}

export function isPaidPlanKey(plan: SubscriptionPlanKey): boolean {
  return plan === PRO_PLAN_KEY || plan === EXPERT_PLAN_KEY
}

export function hasExpertAccess(plan: SubscriptionPlanKey): boolean {
  return plan === FREE_TRIAL_PLAN_KEY || plan === EXPERT_PLAN_KEY
}
