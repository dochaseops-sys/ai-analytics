import { z } from 'zod';
import { GA4AuditData, GTMAuditData } from '@/lib/audit-engine/types';
import { ClientProfile, WebsiteSnapshot } from '@/lib/client-intelligence/types';

export const personalisedSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

export const implementationTypeSchema = z.enum([
  'ga4_event',
  'gtm_trigger',
  'meta_pixel',
  'tiktok_pixel',
  'linkedin_insight_tag',
  'custom_html',
  'manual_review'
]);

export const implementationContextSchema = z.object({
  eventName: z.string().optional(),
  triggerType: z.string().optional(),
  selectorHint: z.string().optional(),
  urlPattern: z.string().optional(),
  pixelType: z.string().optional(),
  requiredFields: z.array(z.string()).optional()
});

export const personalisedRecommendationSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  whyItMatters: z.string(),
  evidence: z.record(z.string(), z.string()),
  businessImpact: z.string(),
  recommendedFix: z.string(),
  severity: personalisedSeveritySchema,
  ruleId: z.string(),
  implementationType: implementationTypeSchema,
  canAutoImplement: z.boolean(),
  missingFields: z.array(z.string()),
  implementationContext: implementationContextSchema,
  createdAt: z.any().optional()
});

export const personalisedRuleDefinitionSchema = z.object({
  ruleId: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'measurementCoverage',
    'conversionTracking',
    'eventQuality',
    'channelAttribution',
    'implementationHealth',
    'privacyAndConsent'
  ]),
  appliesToBusinessModels: z.array(z.string()),
  enabled: z.boolean(),
  defaultSeverity: personalisedSeveritySchema,
  evaluator: z.string(),
  recommendedFixTemplate: z.string(),
  implementationType: implementationTypeSchema,
  updatedAt: z.any().optional()
});

export const personalisedRuleResultSchema = z.object({
  ruleId: z.string(),
  name: z.string(),
  passed: z.boolean(),
  severity: personalisedSeveritySchema,
  category: personalisedRuleDefinitionSchema.shape.category,
  description: z.string(),
  evidence: z.record(z.string(), z.string()),
  recommendationId: z.string().optional(),
  appliesBecause: z.string()
});

export const personalisedHealthScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  categoryScores: z.object({
    measurementCoverage: z.number(),
    conversionTracking: z.number(),
    eventQuality: z.number(),
    channelAttribution: z.number(),
    implementationHealth: z.number(),
    privacyAndConsent: z.number()
  }),
  personalisedWeights: z.record(z.string(), z.number()),
  explanation: z.string()
});

export const personalisedAuditRunSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientProfileId: z.string(),
  score: z.number(),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  categoryScores: personalisedHealthScoreSchema.shape.categoryScores,
  personalisedWeights: z.record(z.string(), z.number()),
  scoreExplanation: z.string(),
  results: z.array(personalisedRuleResultSchema),
  gaps: z.array(personalisedRuleResultSchema),
  recommendations: z.array(personalisedRecommendationSchema),
  createdAt: z.any()
});

export const recommendationExplanationSchema = z.object({
  plainEnglishSummary: z.string(),
  businessImpact: z.string(),
  recommendedFix: z.string(),
  priorityReason: z.string()
});

export const suggestedEventMappingSchema = z.object({
  eventMappings: z.array(z.object({
    businessAction: z.string(),
    recommendedEventName: z.string(),
    existingPossibleMatches: z.array(z.string()),
    trackingStatus: z.enum(['tracked', 'partially_tracked', 'missing', 'unclear']),
    recommendation: z.string()
  }))
});

export type PersonalisedSeverity = z.infer<typeof personalisedSeveritySchema>;
export type ImplementationType = z.infer<typeof implementationTypeSchema>;
export type ImplementationContext = z.infer<typeof implementationContextSchema>;
export type PersonalisedRecommendation = z.infer<typeof personalisedRecommendationSchema>;
export type PersonalisedRuleDefinition = z.infer<typeof personalisedRuleDefinitionSchema>;
export type PersonalisedRuleResult = z.infer<typeof personalisedRuleResultSchema>;
export type PersonalisedHealthScore = z.infer<typeof personalisedHealthScoreSchema>;
export type PersonalisedAuditRun = z.infer<typeof personalisedAuditRunSchema>;

export type PersonalisedAuditContext = {
  clientProfile: ClientProfile;
  ga4Data?: GA4AuditData;
  gtmData?: GTMAuditData;
  websiteSnapshot?: WebsiteSnapshot;
  historicalAudits?: Array<{ score?: number; grade?: string; createdAt?: unknown }>;
  trafficSources?: Array<{ sourceMedium: string; sessions: number }>;
  pageTraffic?: Array<{ pagePath: string; sessions: number; conversions: number }>;
};
