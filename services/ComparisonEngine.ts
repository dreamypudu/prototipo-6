import { CanonicalAction, ComparisonResult, ExpectedAction } from '../types';
import { ComparisonRule, comparisonRules } from './comparisonRules';

const pickBestMatch = (
  expected: ExpectedAction,
  matches: CanonicalAction[]
): CanonicalAction => {
  const afterExpected = matches
    .filter((action) => action.committed_at >= expected.created_at)
    .sort((a, b) => a.committed_at - b.committed_at);
  if (afterExpected.length > 0) {
    return afterExpected[0];
  }
  return matches.sort((a, b) => a.committed_at - b.committed_at)[0];
};

const applyRule = (
  expected: ExpectedAction,
  actual: CanonicalAction
): { outcome: ComparisonResult['outcome']; deviation?: any } => {
  const rule: ComparisonRule | undefined = comparisonRules[expected.rule_id];
  if (!rule) {
    return { outcome: 'DEVIATION', deviation: { reason: 'missing_rule', rule_id: expected.rule_id } };
  }
  return rule(expected, actual);
};

export const compareExpectedVsActual = (
  expectedActions: ExpectedAction[],
  canonicalActions: CanonicalAction[],
  existingComparisons: ComparisonResult[] = [],
  options: { includeNotDone?: boolean } = {}
): ComparisonResult[] => {
  const compared = new Set(existingComparisons.map((c) => c.expected_action_id));
  const results: ComparisonResult[] = [];
  const includeNotDone = options.includeNotDone ?? true;

  expectedActions.forEach((expected) => {
    if (compared.has(expected.expected_action_id)) return;

    const matches = canonicalActions.filter(
      (action) =>
        action.action_type === expected.action_type &&
        action.target_ref === expected.target_ref &&
        (!expected.mechanic_id || action.mechanic_id === expected.mechanic_id)
    );

    if (matches.length === 0) {
      if (!includeNotDone) return;
      results.push({
        expected_action_id: expected.expected_action_id,
        canonical_action_id: null,
        outcome: 'NOT_DONE'
      });
      return;
    }

    const best = pickBestMatch(expected, matches);
    const { outcome, deviation } = applyRule(expected, best);
    results.push({
      expected_action_id: expected.expected_action_id,
      canonical_action_id: best.canonical_action_id,
      outcome,
      deviation
    });
  });

  return results;
};
