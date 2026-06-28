import type { StageGroupCode } from '../../../lib/postepyModel';

export type BuildGuide = {
  id: string;
  image: string;
  buildOrder: number;
  stage: StageGroupCode;
  readingTimeMinutes: number;
};

const GUIDE_LIMIT = 6;

export const BUILD_GUIDES: BuildGuide[] = [
  {
    id: 'afterDecisionToBuild',
    image: 'https://www.mybuildiq.com/poradniki/after-decision-to-build.webp',
    buildOrder: 10,
    stage: 'stan_zero',
    readingTimeMinutes: 5,
  },
  {
    id: 'beforeConstructionStarts',
    image: 'https://www.mybuildiq.com/poradniki/before-construction-starts.webp',
    buildOrder: 20,
    stage: 'stan_zero',
    readingTimeMinutes: 5,
  },
  {
    id: 'constructionCostStepByStep',
    image: 'https://www.mybuildiq.com/poradniki/budowa-domu-koszt-krok-po-kroku.webp',
    buildOrder: 30,
    stage: 'stan_zero',
    readingTimeMinutes: 6,
  },
  {
    id: 'constructionStepByStep',
    image: 'https://www.mybuildiq.com/poradniki/budowa-domu-krok-po-kroku.webp',
    buildOrder: 40,
    stage: 'sso',
    readingTimeMinutes: 6,
  },
  {
    id: 'homeBuildChecklist',
    image: 'https://www.mybuildiq.com/poradniki/home-build-checklist.webp',
    buildOrder: 50,
    stage: 'sso',
    readingTimeMinutes: 7,
  },
];

export function selectBuildGuidesForStage(
  guides: BuildGuide[],
  currentStage: StageGroupCode | null | undefined,
  limit = GUIDE_LIMIT
) {
  const ordered = guides.slice().sort((a, b) => a.buildOrder - b.buildOrder);
  if (!currentStage) return ordered.slice(0, limit);

  const stageGuides = ordered.filter((guide) => guide.stage === currentStage);
  const minStageOrder = stageGuides[0]?.buildOrder ?? ordered.find((guide) => guide.stage === currentStage)?.buildOrder ?? 0;
  const nextGuides = ordered.filter((guide) => guide.stage !== currentStage && guide.buildOrder > minStageOrder);
  const earlierFallback = ordered.filter((guide) => guide.stage !== currentStage && guide.buildOrder <= minStageOrder);

  return [...stageGuides, ...nextGuides, ...earlierFallback].slice(0, limit);
}
