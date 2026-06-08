import { adminDb } from '@/lib/firebase-admin';
import { PersonalisedRuleDefinition, personalisedRuleDefinitionSchema } from './types';

export const DEFAULT_PERSONALISED_RULES: PersonalisedRuleDefinition[] = [
  ['expected-critical-event-missing', 'Expected critical event missing', 'expectedCriticalEventMissing', 'measurementCoverage', 'critical', 'ga4_event'],
  ['expected-event-not-key-event', 'Expected event is not marked as key event', 'expectedEventNotKeyEvent', 'conversionTracking', 'high', 'manual_review'],
  ['cta-no-gtm-trigger', 'CTA exists but no matching GTM trigger exists', 'ctaNoGtmTrigger', 'implementationHealth', 'high', 'gtm_trigger'],
  ['cta-no-ga4-event', 'CTA exists but no matching GA4 event exists', 'ctaNoGa4Event', 'measurementCoverage', 'high', 'ga4_event'],
  ['high-intent-page-no-conversion', 'High-intent page has traffic but no conversion events', 'highIntentPageNoConversion', 'conversionTracking', 'high', 'ga4_event'],
  ['paid-traffic-no-platform-measurement', 'Paid traffic exists but no platform measurement', 'paidTrafficNoPlatformMeasurement', 'channelAttribution', 'high', 'meta_pixel'],
  ['pixel-without-ga4-key-event', 'Ad platform pixel exists but GA4 key event is missing', 'pixelWithoutGa4KeyEvent', 'channelAttribution', 'high', 'ga4_event'],
  ['ga4-event-without-gtm', 'GA4 event exists but GTM implementation is missing', 'ga4EventWithoutGtm', 'implementationHealth', 'info', 'manual_review'],
  ['gtm-tag-zero-volume', 'GTM tag exists but GA4 event has zero recent volume', 'gtmTagZeroVolume', 'implementationHealth', 'medium', 'manual_review'],
  ['duplicate-key-event-suspected', 'Duplicate key event suspected', 'duplicateKeyEventSuspected', 'eventQuality', 'high', 'manual_review'],
  ['event-naming-inconsistency', 'Event naming inconsistency', 'eventNamingInconsistency', 'eventQuality', 'medium', 'manual_review'],
  ['funnel-step-missing', 'Funnel step missing', 'funnelStepMissing', 'measurementCoverage', 'high', 'ga4_event'],
  ['industry-privacy-concern', 'Industry-specific privacy concern', 'industryPrivacyConcern', 'privacyAndConsent', 'high', 'manual_review'],
  ['thank-you-page-mismatch', 'Thank-you page tracking mismatch', 'thankYouPageMismatch', 'conversionTracking', 'high', 'ga4_event'],
  ['contact-method-imbalance', 'Contact method imbalance', 'contactMethodImbalance', 'measurementCoverage', 'medium', 'ga4_event'],
  ['campaign-landing-page-gap', 'Campaign landing page measurement gap', 'campaignLandingPageGap', 'conversionTracking', 'high', 'ga4_event'],
  ['organic-content-opportunity', 'Organic/search content opportunity', 'organicContentOpportunity', 'measurementCoverage', 'medium', 'ga4_event'],
  ['revenue-data-quality', 'Revenue data quality issue', 'revenueDataQuality', 'eventQuality', 'critical', 'manual_review'],
  ['booking-widget-not-tracked', 'Booking widget not tracked', 'bookingWidgetNotTracked', 'conversionTracking', 'high', 'ga4_event'],
  ['crm-lead-destination-gap', 'CRM or lead destination gap', 'crmLeadDestinationGap', 'implementationHealth', 'medium', 'manual_review']
].map(([ruleId, name, evaluator, category, defaultSeverity, implementationType]) => personalisedRuleDefinitionSchema.parse({
  ruleId,
  name,
  evaluator,
  category,
  defaultSeverity,
  implementationType,
  description: name,
  appliesToBusinessModels: ['all'],
  enabled: true,
  recommendedFixTemplate: name,
  updatedAt: new Date()
}));

export async function getPersonalisedRuleRegistry(): Promise<PersonalisedRuleDefinition[]> {
  const collection = adminDb.collection('personalised_audit_rule_registry');
  const snap = await collection.where('enabled', '==', true).get();

  if (snap.empty) {
    await Promise.all(DEFAULT_PERSONALISED_RULES.map((rule) => collection.doc(rule.ruleId).set(rule, { merge: true })));
    return DEFAULT_PERSONALISED_RULES;
  }

  const existing = new Map(snap.docs.map((doc) => [doc.id, personalisedRuleDefinitionSchema.parse(doc.data())]));
  await Promise.all(DEFAULT_PERSONALISED_RULES.filter((rule) => !existing.has(rule.ruleId)).map((rule) => collection.doc(rule.ruleId).set(rule, { merge: true })));
  return DEFAULT_PERSONALISED_RULES.map((rule) => existing.get(rule.ruleId) || rule).filter((rule) => rule.enabled);
}
