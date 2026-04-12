export type SubscriptionPlanKey = 'free' | 'standard' | 'pro'

export type SubscriptionFeatureKey = 'photos' | 'docs' | 'tasks' | 'model3d' | 'ai'

export type SubscriptionPlanDefinition = {
  key: SubscriptionPlanKey
  nameKey: string
  descKey: string
  monthlyPrice: number | null
  yearlyPrice: number | null
  color: string
  glowColor: string
  popular: boolean
  features: {
    photos: number | 'unlimited'
    docs: number | 'unlimited'
    tasks: number | 'unlimited'
    model3d: boolean
    ai: boolean
  }
}

export const SUBSCRIPTION_PLAN_ORDER: SubscriptionPlanKey[] = ['free', 'standard', 'pro']

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
      tasks: 15,
      model3d: false,
      ai: false,
    },
  },
  standard: {
    key: 'standard',
    nameKey: 'plans.standard.name',
    descKey: 'plans.standard.desc',
    monthlyPrice: 19.99,
    yearlyPrice: 399,
    color: 'rgba(25,112,92,0.14)',
    glowColor: 'rgba(25,112,92,0.35)',
    popular: true,
    features: {
      photos: 50,
      docs: 15,
      tasks: 50,
      model3d: true,
      ai: false,
    },
  },
  pro: {
    key: 'pro',
    nameKey: 'plans.pro.name',
    descKey: 'plans.pro.desc',
    monthlyPrice: 34.99,
    yearlyPrice: 699,
    color: 'rgba(37,240,200,0.08)',
    glowColor: 'rgba(37,240,200,0.40)',
    popular: false,
    features: {
      photos: 'unlimited',
      docs: 'unlimited',
      tasks: 'unlimited',
      model3d: true,
      ai: true,
    },
  },
}

export const SUBSCRIPTION_PLAN_LIST = SUBSCRIPTION_PLAN_ORDER.map((key) => SUBSCRIPTION_PLANS[key])

export function getPlansWithFeature(feature: SubscriptionFeatureKey): SubscriptionPlanKey[] {
  return SUBSCRIPTION_PLAN_ORDER.filter((key) => SUBSCRIPTION_PLANS[key].features[feature])
}
