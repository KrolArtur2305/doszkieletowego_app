import type { StageGroupCode } from '../../../lib/postepyModel';

export type BuildGuide = {
  title: string;
  image: string;
  url: string;
  buildOrder: number;
  stage: StageGroupCode;
  readingTime: string;
};

const GUIDE_LIMIT = 6;

export const BUILD_GUIDES: BuildGuide[] = [
  {
    title: 'Co zrobić po podjęciu decyzji o budowie domu?',
    image: 'https://www.mybuildiq.com/poradniki/after-decision-to-build.webp',
    url: 'https://www.mybuildiq.com/pl/poradniki/co-zrobic-po-podjeciu-decyzji-o-budowie',
    buildOrder: 10,
    stage: 'stan_zero',
    readingTime: '5 min',
  },
  {
    title: 'Checklista przed rozpoczęciem budowy domu',
    image: 'https://www.mybuildiq.com/poradniki/before-construction-starts.webp',
    url: 'https://www.mybuildiq.com/pl/poradniki/checklista-przed-rozpoczeciem-budowy',
    buildOrder: 20,
    stage: 'stan_zero',
    readingTime: '5 min',
  },
  {
    title: 'Budowa domu koszt krok po kroku: etapy i budżet',
    image: 'https://www.mybuildiq.com/poradniki/budowa-domu-koszt-krok-po-kroku.webp',
    url: 'https://www.mybuildiq.com/pl/poradniki/budowa-domu-koszt-krok-po-kroku',
    buildOrder: 30,
    stage: 'stan_zero',
    readingTime: '6 min',
  },
  {
    title: 'Budowa domu krok po kroku: etapy inwestora',
    image: 'https://www.mybuildiq.com/poradniki/budowa-domu-krok-po-kroku.webp',
    url: 'https://www.mybuildiq.com/pl/poradniki/budowa-domu-krok-po-kroku',
    buildOrder: 40,
    stage: 'sso',
    readingTime: '6 min',
  },
  {
    title: 'Checklista budowy domu: co kontrolować od startu do odbioru',
    image: 'https://www.mybuildiq.com/poradniki/home-build-checklist.webp',
    url: 'https://www.mybuildiq.com/pl/poradniki/budowa-domu-checklista',
    buildOrder: 50,
    stage: 'sso',
    readingTime: '7 min',
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
