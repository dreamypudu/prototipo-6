import { CanonicalAction, ExpectedAction } from '../types';

export type ComparisonOutcome = 'DONE_OK' | 'DEVIATION';

export type ComparisonRule = (
  expected: ExpectedAction,
  actual: CanonicalAction
) => { outcome: ComparisonOutcome; deviation?: any };

const isObject = (value: unknown): value is Record<string, any> => {
  return value !== null && typeof value === 'object';
};

const deepEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(a[key], b[key]));
};

const defaultRule: ComparisonRule = (expected, actual) => {
  const constraints = expected.constraints || {};
  const constraintKeys = Object.keys(constraints);
  if (constraintKeys.length === 0) {
    return { outcome: 'DONE_OK' };
  }

  const actualValues = isObject(actual.value_final) ? actual.value_final : {};
  const actualContext = isObject(actual.context) ? actual.context : {};
  const mergedActual = { ...actualContext, ...actualValues };
  const missing: Record<string, any> = {};

  constraintKeys.forEach((key) => {
    if (!(key in mergedActual) || !deepEqual(mergedActual[key], constraints[key])) {
      missing[key] = constraints[key];
    }
  });

  if (Object.keys(missing).length === 0) {
    return { outcome: 'DONE_OK' };
  }

  return {
    outcome: 'DEVIATION',
    deviation: {
      missing,
      actual: mergedActual
    }
  };
};

// Regla permisiva para rule_id que se resuelven en backend o no tienen constraints en front
const passThroughRule: ComparisonRule = () => ({ outcome: 'DONE_OK' });

export const comparisonRules: Record<string, ComparisonRule> = {
  default_rule: defaultRule,
  meeting_time_rule_v1: passThroughRule,
  visit_stakeholder_rule_v1: passThroughRule,
  research_hours_rule_v1: passThroughRule,
  training_commitment_rule_v1: passThroughRule,
  cross_sector_help_rule_v1: passThroughRule,
  scheduler_war_rule_v1: passThroughRule,
  visit_priority_rule_v1: passThroughRule
};
