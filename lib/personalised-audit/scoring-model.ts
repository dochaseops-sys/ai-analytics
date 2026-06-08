import { PersonalisedAuditContext, PersonalisedHealthScore, PersonalisedRuleResult } from './types';

const categoryWeightsByModel: Record<string, Record<string, number>> = {
  ecommerce: { measurementCoverage: 25, conversionTracking: 30, eventQuality: 20, channelAttribution: 10, implementationHealth: 10, privacyAndConsent: 5 },
  lead_generation: { measurementCoverage: 25, conversionTracking: 30, eventQuality: 10, channelAttribution: 15, implementationHealth: 15, privacyAndConsent: 5 },
  saas: { measurementCoverage: 25, conversionTracking: 25, eventQuality: 15, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 10 },
  publisher: { measurementCoverage: 30, conversionTracking: 15, eventQuality: 15, channelAttribution: 15, implementationHealth: 10, privacyAndConsent: 15 },
  healthcare: { measurementCoverage: 20, conversionTracking: 25, eventQuality: 10, channelAttribution: 5, implementationHealth: 15, privacyAndConsent: 25 },
  financial_services: { measurementCoverage: 20, conversionTracking: 25, eventQuality: 10, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 20 },
  education: { measurementCoverage: 25, conversionTracking: 25, eventQuality: 10, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 15 },
  real_estate: { measurementCoverage: 25, conversionTracking: 30, eventQuality: 10, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 10 },
  local_services: { measurementCoverage: 25, conversionTracking: 30, eventQuality: 10, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 10 },
  unknown: { measurementCoverage: 25, conversionTracking: 25, eventQuality: 15, channelAttribution: 10, implementationHealth: 15, privacyAndConsent: 10 }
};

const severityPenalty = { critical: 1, high: 0.75, medium: 0.45, low: 0.2, info: 0.05 };

export function calculatePersonalisedHealthScore({
  clientProfile,
  gaps
}: Pick<PersonalisedAuditContext, 'clientProfile'> & { gaps: PersonalisedRuleResult[] }): PersonalisedHealthScore {
  const personalisedWeights = categoryWeightsByModel[clientProfile.businessModel] || categoryWeightsByModel.unknown;
  const categoryScores: PersonalisedHealthScore['categoryScores'] = {
    measurementCoverage: 100,
    conversionTracking: 100,
    eventQuality: 100,
    channelAttribution: 100,
    implementationHealth: 100,
    privacyAndConsent: 100
  };

  for (const gap of gaps) {
    const penalty = severityPenalty[gap.severity] * 22;
    categoryScores[gap.category] = Math.max(0, categoryScores[gap.category] - penalty);
  }

  const totalWeight = Object.values(personalisedWeights).reduce((sum, weight) => sum + weight, 0);
  const score = Math.round(Object.entries(personalisedWeights).reduce((sum, [category, weight]) => {
    return sum + ((categoryScores[category as keyof typeof categoryScores] || 0) * weight);
  }, 0) / totalWeight);

  const grade: PersonalisedHealthScore['grade'] = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return {
    score,
    grade,
    categoryScores,
    personalisedWeights,
    explanation: `Scoring is weighted for a ${clientProfile.businessModel} ${clientProfile.funnelType} funnel, so expected events and CTAs relevant to this client count more than irrelevant generic events.`
  };
}
