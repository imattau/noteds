import { describe, expect, it } from 'vitest';
import { evaluateRanking, ndcgAtK, precisionAtK, reciprocalRank } from './rankingEvaluation';

describe('ranking evaluation', () => {
  it('scores the first relevant result with reciprocal rank', () => {
    expect(reciprocalRank(['a', 'b', 'c'], ['c'])).toBeCloseTo(1 / 3);
    expect(reciprocalRank(['a'], ['missing'])).toBe(0);
  });

  it('calculates precision at k with a fixed cutoff', () => {
    expect(precisionAtK(['a', 'b', 'c'], ['b', 'c'], 2)).toBe(0.5);
    expect(precisionAtK(['a', 'b'], ['a'], 0)).toBe(0);
  });

  it('normalizes discounted cumulative gain against the ideal order', () => {
    expect(ndcgAtK(['c', 'a', 'b'], ['a', 'b'], 3)).toBeLessThan(1);
    expect(ndcgAtK(['a', 'b', 'c'], ['a', 'b'], 3)).toBe(1);
  });

  it('returns a complete metric bundle for ranking experiments', () => {
    expect(evaluateRanking(['listing-2', 'listing-1'], ['listing-1'], 2)).toEqual({
      reciprocalRank: 0.5,
      precisionAtK: 0.5,
      ndcgAtK: 0.6309297535714575
    });
  });
});
