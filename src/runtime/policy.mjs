export function conditionRequiredForOutcome(condition, outcome) {
  return condition.required === true || condition.requiredForOutcomes?.includes(outcome) === true;
}
