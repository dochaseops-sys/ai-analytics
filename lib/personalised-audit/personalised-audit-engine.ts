import { buildEventEvidence, detectPlatformTags, findGtmTagForEvent, findGtmTriggerForCta, summariseWebsite } from './evidence-builder';
import { getApplicableRules } from './rule-generator';
import { getPersonalisedRuleRegistry } from './rule-registry';
import { calculatePersonalisedHealthScore } from './scoring-model';
import { PersonalisedAuditContext, PersonalisedAuditRun, PersonalisedRuleDefinition, PersonalisedRuleResult } from './types';
import { hasPotentialPiiName, normaliseName } from './validators';
import { mapRecommendation } from './recommendation-mapper';

function result(rule: PersonalisedRuleDefinition, passed: boolean, description: string, evidence: Record<string, string>, appliesBecause: string, severity = rule.defaultSeverity): PersonalisedRuleResult {
  return {
    ruleId: rule.ruleId,
    name: rule.name,
    passed,
    severity,
    category: rule.category,
    description,
    evidence,
    appliesBecause
  };
}

function evaluate(rule: PersonalisedRuleDefinition, context: PersonalisedAuditContext): PersonalisedRuleResult[] {
  const profile = context.clientProfile;
  const eventEvidence = buildEventEvidence(profile, context.ga4Data);
  const website = summariseWebsite(context.websiteSnapshot);
  const events = context.ga4Data?.eventsLast7Days || [];
  const eventNames = events.map((event) => normaliseName(event.eventName));
  const keyEvents = (context.ga4Data?.conversions || []).map((event) => normaliseName(event.name));
  const platformTags = detectPlatformTags(context.gtmData);
  const appliesBecause = `Applies because this client is classified as ${profile.businessModel} with a ${profile.funnelType} funnel.`;

  switch (rule.evaluator) {
    case 'expectedCriticalEventMissing':
      return eventEvidence
        .filter((item) => ['critical', 'high'].includes(item.expectedEvent.priority) && !item.present)
        .map((item) => result(rule, false, `${item.expectedEvent.eventName} is expected but absent from recent GA4 events.`, {
          expectedEvent: item.expectedEvent.eventName,
          priority: item.expectedEvent.priority,
          ga4: 'No matching event in recent GA4 data',
          reason: item.expectedEvent.reason,
          triggerType: item.expectedEvent.implementationHint?.triggerType || '',
          selectorHint: item.expectedEvent.implementationHint?.selectorHint || '',
          urlPattern: item.expectedEvent.implementationHint?.urlPattern || ''
        }, appliesBecause, item.expectedEvent.priority === 'critical' ? 'critical' : 'high'));

    case 'expectedEventNotKeyEvent':
      return eventEvidence
        .filter((item) => item.present && !item.isKeyEvent && profile.primaryConversionGoals.some((goal) => normaliseName(goal) === normaliseName(item.expectedEvent.eventName) || item.expectedEvent.matchingEventNames.map(normaliseName).includes(normaliseName(goal))))
        .map((item) => result(rule, false, `${item.synonymMatch || item.expectedEvent.eventName} exists but is not configured as a GA4 key event.`, {
          eventName: item.synonymMatch || item.expectedEvent.eventName,
          keyEvents: keyEvents.join(', ') || 'No key events detected'
        }, appliesBecause));

    case 'ctaNoGtmTrigger':
      return profile.detectedCTAs
        .filter((cta) => ['phone', 'whatsapp', 'email', 'booking', 'checkout', 'signup', 'download', 'form'].includes(cta.type))
        .filter((cta) => !findGtmTriggerForCta(context.gtmData, cta.label, cta.urlPattern, cta.type))
        .slice(0, 10)
        .map((cta) => result(rule, false, `${cta.type} CTA "${cta.label}" has no matching GTM trigger evidence.`, {
          ctaType: cta.type,
          label: cta.label,
          pageUrl: cta.pageUrl,
          selectorHint: cta.selectorHint || '',
          urlPattern: cta.urlPattern || '',
          gtm: 'No trigger/tag name matched this CTA'
        }, `Applies because a ${cta.type} CTA was detected on the website.`));

    case 'ctaNoGa4Event':
      return profile.detectedCTAs
        .filter((cta) => ['phone', 'whatsapp', 'email', 'booking', 'checkout', 'signup', 'download', 'form'].includes(cta.type))
        .filter((cta) => !eventNames.some((name) => name.includes(cta.type) || (cta.type === 'form' && /form|lead|enquiry/.test(name))))
        .slice(0, 10)
        .map((cta) => result(rule, false, `${cta.type} CTA "${cta.label}" exists but no matching GA4 event was found.`, {
          ctaType: cta.type,
          label: cta.label,
          pageUrl: cta.pageUrl,
          ga4: 'No matching recent event',
          selectorHint: cta.selectorHint || '',
          urlPattern: cta.urlPattern || ''
        }, `Applies because a ${cta.type} CTA was detected on the website.`));

    case 'highIntentPageNoConversion': {
      const hasConversion = eventEvidence.some((item) => item.present && ['critical', 'high'].includes(item.expectedEvent.priority));
      const highIntentPages = profile.importantPages.filter((page) => page.detectedIntent === 'conversion' || ['pricing', 'checkout', 'contact', 'booking', 'product', 'service', 'landing_page'].includes(page.pageType));
      return highIntentPages.length && !hasConversion
        ? [result(rule, false, `${highIntentPages.length} high-intent pages were detected but no high-priority conversion events have recent volume.`, { website: `${highIntentPages.length} high-intent pages`, ga4: 'No high-priority conversion event volume' }, appliesBecause)]
        : [];
    }

    case 'paidTrafficNoPlatformMeasurement': {
      const sources = (context.trafficSources || []).map((source) => source.sourceMedium.toLowerCase()).join(' ');
      const needsMeta = /facebook|instagram|meta/.test(sources) && !platformTags.meta;
      const needsTikTok = /tiktok/.test(sources) && !platformTags.tiktok;
      const needsLinkedIn = /linkedin/.test(sources) && !platformTags.linkedin;
      return [
        needsMeta ? result(rule, false, 'Meta traffic exists but Meta Pixel was not detected in GTM.', { traffic: sources, gtm: 'No Meta Pixel tag detected' }, appliesBecause) : undefined,
        needsTikTok ? result(rule, false, 'TikTok traffic exists but TikTok Pixel was not detected in GTM.', { traffic: sources, gtm: 'No TikTok Pixel tag detected' }, appliesBecause) : undefined,
        needsLinkedIn ? result(rule, false, 'LinkedIn traffic exists but LinkedIn Insight Tag was not detected in GTM.', { traffic: sources, gtm: 'No LinkedIn tag detected' }, appliesBecause) : undefined
      ].filter(Boolean) as PersonalisedRuleResult[];
    }

    case 'pixelWithoutGa4KeyEvent':
      return (platformTags.meta || platformTags.tiktok || platformTags.linkedin) && !eventEvidence.some((item) => item.isKeyEvent && ['critical', 'high'].includes(item.expectedEvent.priority))
        ? [result(rule, false, 'An ad platform pixel exists, but no matching primary GA4 key event was detected.', { gtm: JSON.stringify(platformTags), ga4: 'No primary key event detected' }, appliesBecause)]
        : [];

    case 'ga4EventWithoutGtm':
      return eventEvidence
        .filter((item) => item.present && !findGtmTagForEvent(context.gtmData, item.expectedEvent.eventName, item.expectedEvent.matchingEventNames))
        .slice(0, 8)
        .map((item) => result(rule, false, `${item.synonymMatch || item.expectedEvent.eventName} exists in GA4 but no matching GTM tag was found.`, { eventName: item.synonymMatch || item.expectedEvent.eventName, gtm: 'No matching tag name' }, appliesBecause, 'info'));

    case 'gtmTagZeroVolume':
      return profile.expectedEvents
        .filter((expected) => findGtmTagForEvent(context.gtmData, expected.eventName, expected.matchingEventNames) && !eventEvidence.find((item) => item.expectedEvent.eventName === expected.eventName)?.count)
        .map((expected) => result(rule, false, `${expected.eventName} appears to be implemented in GTM but has zero recent GA4 volume.`, { eventName: expected.eventName, gtm: 'Matching tag detected', ga4: '0 recent events' }, appliesBecause));

    case 'duplicateKeyEventSuspected':
      return (context.ga4Data?.duplicatePurchasesCount || 0) > 0
        ? [result(rule, false, `${context.ga4Data?.duplicatePurchasesCount} duplicate purchase transaction IDs were detected.`, { duplicatePurchases: String(context.ga4Data?.duplicatePurchasesCount) }, appliesBecause)]
        : [];

    case 'eventNamingInconsistency': {
      const leadLike = eventNames.filter((name) => /lead|form|enquiry|inquiry|contact/.test(name));
      return new Set(leadLike).size > 2 ? [result(rule, false, 'Multiple events appear to represent the same lead action.', { ga4: leadLike.join(', ') }, appliesBecause)] : [];
    }

    case 'funnelStepMissing': {
      const hasEvent = (name: string) => eventNames.includes(normaliseName(name));
      const missing: string[] = [];
      if (profile.businessModel === 'ecommerce' && hasEvent('purchase')) ['add_to_cart', 'begin_checkout'].forEach((name) => !hasEvent(name) && missing.push(name));
      if (profile.businessModel === 'saas' && hasEvent('sign_up')) ['trial_start', 'demo_request'].forEach((name) => !hasEvent(name) && missing.push(name));
      if (['lead_generation', 'real_estate'].includes(profile.businessModel) && (hasEvent('generate_lead') || hasEvent('form_submit')) && !hasEvent('form_start')) missing.push('form_start');
      return missing.length ? [result(rule, false, `Missing funnel step visibility: ${missing.join(', ')}.`, { missing: missing.join(', ') }, appliesBecause)] : [];
    }

    case 'industryPrivacyConcern': {
      const sensitive = ['healthcare', 'financial_services', 'education'].includes(profile.businessModel);
      const risky = [...eventNames, ...(context.gtmData?.variables || []).map((variable) => variable.name)].filter(hasPotentialPiiName);
      return sensitive && risky.length ? [result(rule, false, 'Potentially privacy-sensitive event or variable names were detected.', { riskyNames: risky.join(', ') }, `Applies because ${profile.businessModel} tracking should avoid sending personal data to analytics or ad platforms.`)] : [];
    }

    case 'thankYouPageMismatch':
      return website.thankYouPages > 0 && !eventNames.some((name) => /thank_you|generate_lead|form_submit/.test(name))
        ? [result(rule, false, 'Thank-you pages exist but no thank-you or lead success event was detected.', { website: `${website.thankYouPages} thank-you pages`, ga4: 'No thank_you_page_view or generate_lead event' }, appliesBecause)]
        : [];

    case 'contactMethodImbalance': {
      const methods = [
        website.forms > 0 && 'forms',
        website.phoneLinks > 0 && 'phone',
        website.emailLinks > 0 && 'email',
        website.whatsappLinks > 0 && 'whatsapp',
        profile.detectedCTAs.some((cta) => cta.type === 'booking') && 'booking'
      ].filter(Boolean) as string[];
      const tracked = methods.filter((method) => eventNames.some((name) => name.includes(method) || (method === 'forms' && /form|lead/.test(name))));
      return methods.length > 1 && tracked.length < methods.length
        ? [result(rule, false, 'The website offers multiple contact methods but not all are tracked.', { website: methods.join(', '), tracked: tracked.join(', ') || 'None' }, appliesBecause)]
        : [];
    }

    case 'campaignLandingPageGap': {
      const landingPages = profile.importantPages.filter((page) => page.pageType === 'landing_page');
      const hasCtaTracking = eventEvidence.some((item) => item.present && ['critical', 'high'].includes(item.expectedEvent.priority));
      return landingPages.length > 0 && !hasCtaTracking ? [result(rule, false, 'Campaign landing pages were detected without high-priority CTA tracking evidence.', { landingPages: String(landingPages.length), ga4: 'No high-priority CTA event' }, appliesBecause)] : [];
    }

    case 'organicContentOpportunity':
      return (profile.businessModel === 'publisher' || profile.importantPages.filter((page) => ['blog', 'article'].includes(page.pageType)).length >= 5) && !eventNames.some((name) => /scroll|newsletter|outbound/.test(name))
        ? [result(rule, false, 'Content pages are present, but scroll/newsletter/outbound engagement events are missing.', { website: 'Content-led pages detected', ga4: 'No scroll/newsletter/outbound events' }, appliesBecause)]
        : [];

    case 'revenueDataQuality':
      return profile.businessModel === 'ecommerce' && eventNames.includes('purchase') && !eventNames.some((name) => /refund|add_payment_info|add_shipping_info/.test(name))
        ? [result(rule, false, 'Purchase exists, but supporting ecommerce data quality signals are incomplete.', { ga4: 'purchase exists; payment/shipping/refund signals not found' }, appliesBecause)]
        : [];

    case 'bookingWidgetNotTracked': {
      const bookingCtas = profile.detectedCTAs.filter((cta) => cta.type === 'booking' || /calendly|acuity|hubspot|bookings/i.test(`${cta.label} ${cta.urlPattern || ''}`));
      return bookingCtas.length > 0 && !eventNames.some((name) => /booking|appointment|viewing|demo_request/.test(name))
        ? [result(rule, false, 'Booking widget or booking links were detected without booking event tracking.', { website: `${bookingCtas.length} booking CTAs`, ga4: 'No booking-related event' }, appliesBecause)]
        : [];
    }

    case 'crmLeadDestinationGap':
      return website.forms > 0 && ![...(context.gtmData?.tags || [])].some((tag) => /hubspot|salesforce|zoho|crm|lead/.test(`${tag.name} ${tag.type}`.toLowerCase()))
        ? [result(rule, false, 'Lead forms exist, but no CRM or lead destination mapping was detected in GTM.', { website: `${website.forms} forms`, gtm: 'No CRM/ad platform lead tag name detected' }, appliesBecause)]
        : [];

    default:
      return [];
  }
}

export async function runPersonalisedAudit(context: PersonalisedAuditContext): Promise<Omit<PersonalisedAuditRun, 'id' | 'createdAt'>> {
  const registry = await getPersonalisedRuleRegistry();
  const rules = getApplicableRules(context, registry);
  const results = rules.flatMap((rule) => evaluate(rule, context));
  const gaps = results.filter((item) => !item.passed);
  const recommendations = await Promise.all(gaps.map(async (gap) => {
    const rule = rules.find((item) => item.ruleId === gap.ruleId)!;
    return mapRecommendation(context, rule, gap);
  }));
  const score = calculatePersonalisedHealthScore({ clientProfile: context.clientProfile, gaps });

  return {
    clientId: context.clientProfile.clientId,
    clientProfileId: context.clientProfile.id,
    score: score.score,
    grade: score.grade,
    categoryScores: score.categoryScores,
    personalisedWeights: score.personalisedWeights,
    scoreExplanation: score.explanation,
    results,
    gaps,
    recommendations
  };
}
