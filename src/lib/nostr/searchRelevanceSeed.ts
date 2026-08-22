import type { GradedRelevanceJudgment } from './rankingEvaluation';

export interface SearchRelevanceCase {
  query: string;
  judgments: GradedRelevanceJudgment[];
  annotation: string;
}

/** Initial hand-authored seed; replace IDs with exported relay listing keys during annotation. */
export const SEARCH_RELEVANCE_SEED: SearchRelevanceCase[] = [
  {
    query: 'road bike',
    annotation: 'Exact product intent should outrank adjacent cycling accessories and unrelated vehicles.',
    judgments: [
      { id: 'listing:road-bike-carbon', relevance: 3 },
      { id: 'listing:bike-helmet', relevance: 2 },
      { id: 'listing:bicycle-repair', relevance: 2 },
      { id: 'listing:mountain-bike', relevance: 2 },
      { id: 'listing:car-sale', relevance: 0 }
    ]
  },
  {
    query: 'melbourne cleaning',
    annotation: 'Local service matches are highly relevant; remote or unrelated cleaning products are not.',
    judgments: [
      { id: 'listing:melbourne-home-cleaning', relevance: 3 },
      { id: 'listing:fitzroy-end-of-lease-clean', relevance: 3 },
      { id: 'listing:remote-cleaning-course', relevance: 1 },
      { id: 'listing:vacuum-sale', relevance: 1 },
      { id: 'listing:brisbane-plumbing', relevance: 0 }
    ]
  },
  {
    query: 'two bedroom apartment',
    annotation: 'Listings satisfying property type and bedroom count are ideal; generic housing is partially relevant.',
    judgments: [
      { id: 'listing:two-bed-apartment', relevance: 3 },
      { id: 'listing:one-bed-apartment', relevance: 2 },
      { id: 'listing:three-bed-house', relevance: 1 },
      { id: 'listing:office-space', relevance: 0 },
      { id: 'listing:used-sofa', relevance: 0 }
    ]
  }
];
