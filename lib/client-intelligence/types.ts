import { z } from 'zod';

export const businessModelSchema = z.enum([
  'ecommerce',
  'lead_generation',
  'saas',
  'publisher',
  'marketplace',
  'real_estate',
  'healthcare',
  'education',
  'financial_services',
  'local_services',
  'nonprofit',
  'unknown'
]);

export const funnelTypeSchema = z.enum([
  'purchase',
  'lead',
  'booking',
  'subscription',
  'trial',
  'content_engagement',
  'multi_step',
  'unknown'
]);

export const ctaTypeSchema = z.enum([
  'form',
  'phone',
  'whatsapp',
  'email',
  'booking',
  'checkout',
  'download',
  'signup',
  'login',
  'newsletter',
  'outbound',
  'chat',
  'unknown'
]);

export const pageTypeSchema = z.enum([
  'home',
  'landing_page',
  'product',
  'service',
  'pricing',
  'checkout',
  'contact',
  'booking',
  'blog',
  'article',
  'thank_you',
  'login',
  'signup',
  'unknown'
]);

export const detectedIntentSchema = z.enum([
  'awareness',
  'consideration',
  'conversion',
  'retention',
  'support',
  'unknown'
]);

export const adPlatformSchema = z.enum([
  'google_ads',
  'meta',
  'tiktok',
  'linkedin',
  'x',
  'pinterest',
  'unknown'
]);

export const expectedEventSchema = z.object({
  eventName: z.string().min(1),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  reason: z.string().min(1),
  matchingEventNames: z.array(z.string()).default([]),
  matchingTagPatterns: z.array(z.string()).default([]),
  matchingTriggerPatterns: z.array(z.string()).default([]),
  implementationHint: z.object({
    tagType: z.enum(['ga4_event', 'meta_pixel', 'tiktok_pixel', 'custom_html', 'manual']),
    triggerType: z.enum(['click', 'form_submit', 'pageview', 'custom_event']),
    selectorHint: z.string().optional(),
    urlPattern: z.string().optional()
  }).optional()
});

export const detectedCtaSchema = z.object({
  label: z.string().min(1),
  type: ctaTypeSchema,
  selectorHint: z.string().optional(),
  urlPattern: z.string().optional(),
  pageUrl: z.string().min(1)
});

export const importantPageSchema = z.object({
  url: z.string().min(1),
  pageType: pageTypeSchema,
  detectedIntent: detectedIntentSchema
});

export const websitePageSnapshotSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  headings: z.array(z.string()),
  ctas: z.array(z.object({
    label: z.string(),
    href: z.string().optional(),
    selectorHint: z.string().optional(),
    type: z.string()
  })),
  formsDetected: z.number().int().nonnegative(),
  phoneLinks: z.array(z.string()),
  emailLinks: z.array(z.string()),
  whatsappLinks: z.array(z.string()),
  internalLinks: z.array(z.string()),
  pageType: pageTypeSchema.optional()
});

export const websiteSnapshotSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  websiteUrl: z.string(),
  pages: z.array(websitePageSnapshotSchema),
  createdAt: z.any()
});

export const clientProfileSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  websiteUrl: z.string(),
  industry: z.string(),
  businessModel: businessModelSchema,
  funnelType: funnelTypeSchema,
  primaryConversionGoals: z.array(z.string()),
  secondaryConversionGoals: z.array(z.string()),
  detectedCTAs: z.array(detectedCtaSchema),
  importantPages: z.array(importantPageSchema),
  expectedEvents: z.array(expectedEventSchema),
  detectedAdPlatforms: z.array(adPlatformSchema),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean().optional(),
  reasoningSummary: z.string().optional(),
  createdAt: z.any(),
  updatedAt: z.any()
});

export const geminiProfileSchema = z.object({
  industry: z.string().min(1),
  businessModel: businessModelSchema,
  funnelType: funnelTypeSchema,
  primaryConversionGoals: z.array(z.string()),
  secondaryConversionGoals: z.array(z.string()),
  importantPages: z.array(z.any()).default([]),
  detectedCTAs: z.array(z.any()).default([]),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string().min(1)
});

export type BusinessModel = z.infer<typeof businessModelSchema>;
export type FunnelType = z.infer<typeof funnelTypeSchema>;
export type CTAType = z.infer<typeof ctaTypeSchema>;
export type PageType = z.infer<typeof pageTypeSchema>;
export type DetectedIntent = z.infer<typeof detectedIntentSchema>;
export type DetectedAdPlatform = z.infer<typeof adPlatformSchema>;
export type ExpectedEvent = z.infer<typeof expectedEventSchema>;
export type DetectedCTA = z.infer<typeof detectedCtaSchema>;
export type ImportantPage = z.infer<typeof importantPageSchema>;
export type WebsitePageSnapshot = z.infer<typeof websitePageSnapshotSchema>;
export type WebsiteSnapshot = z.infer<typeof websiteSnapshotSchema>;
export type ClientProfile = z.infer<typeof clientProfileSchema>;
export type GeminiProfile = z.infer<typeof geminiProfileSchema>;
