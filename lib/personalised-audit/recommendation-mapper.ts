import { generateContentWithRetry } from '@/lib/gemini';
import { PersonalisedAuditContext, PersonalisedRecommendation, PersonalisedRuleDefinition, PersonalisedRuleResult, recommendationExplanationSchema } from './types';
import { parseJsonFromModel } from './validators';

const autoImplementRules = new Set([
  'expected-critical-event-missing',
  'cta-no-gtm-trigger',
  'cta-no-ga4-event',
  'thank-you-page-mismatch',
  'campaign-landing-page-gap',
  'booking-widget-not-tracked',
  'organic-content-opportunity'
]);

async function explainWithGemini(context: PersonalisedAuditContext, result: PersonalisedRuleResult) {
  const prompt = `Return JSON only.
Schema:
{"plainEnglishSummary":"string","businessImpact":"string","recommendedFix":"string","priorityReason":"string"}

Client profile:
${JSON.stringify({
  businessModel: context.clientProfile.businessModel,
  funnelType: context.clientProfile.funnelType,
  industry: context.clientProfile.industry,
  primaryConversionGoals: context.clientProfile.primaryConversionGoals
}, null, 2)}

Rule result:
${JSON.stringify(result, null, 2)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await generateContentWithRetry(prompt, { responseMimeType: 'application/json', temperature: 0.2 });
      return parseJsonFromModel(text, recommendationExplanationSchema);
    } catch (error) {
      console.warn(`[Personalised Audit] Gemini recommendation explanation attempt ${attempt + 1} failed`, error);
    }
  }

  return undefined;
}

export async function mapRecommendation(
  context: PersonalisedAuditContext,
  rule: PersonalisedRuleDefinition,
  result: PersonalisedRuleResult
): Promise<PersonalisedRecommendation> {
  const ai = await explainWithGemini(context, result);
  const eventName = result.evidence.eventName || result.evidence.expectedEvent || result.evidence.ctaType;
  const implementationType = result.severity === 'info' ? 'manual_review' : rule.implementationType;
  const canAutoImplement = autoImplementRules.has(result.ruleId) && implementationType !== 'manual_review';

  const title = result.name;
  const recommendedFix = ai?.recommendedFix || result.description;
  const businessImpact = ai?.businessImpact || `This affects ${context.clientProfile.businessModel} ${context.clientProfile.funnelType} measurement quality.`;

  return {
    id: `${context.clientProfile.clientId}_${result.ruleId}_${Math.random().toString(36).slice(2, 8)}`,
    clientId: context.clientProfile.clientId,
    title,
    whyItMatters: ai?.plainEnglishSummary || `${result.appliesBecause} ${result.description}`,
    evidence: result.evidence,
    businessImpact,
    recommendedFix,
    severity: result.severity,
    ruleId: result.ruleId,
    implementationType,
    canAutoImplement,
    missingFields: canAutoImplement && implementationType === 'ga4_event' ? ['GA4 measurement ID or GA4 config tag reference'] : [],
    implementationContext: {
      eventName,
      triggerType: result.evidence.triggerType,
      selectorHint: result.evidence.selectorHint,
      urlPattern: result.evidence.urlPattern,
      pixelType: implementationType.includes('pixel') ? implementationType : undefined,
      requiredFields: canAutoImplement && implementationType === 'ga4_event' ? ['measurementId'] : undefined
    }
  };
}
