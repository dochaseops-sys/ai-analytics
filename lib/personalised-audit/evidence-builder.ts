import { GA4AuditData, GTMAuditData } from '@/lib/audit-engine/types';
import { ClientProfile, ExpectedEvent, WebsiteSnapshot } from '@/lib/client-intelligence/types';
import { normaliseName } from './validators';

export type EventEvidence = {
  expectedEvent: ExpectedEvent;
  exactMatch?: string;
  synonymMatch?: string;
  present: boolean;
  nonStandardName?: string;
  isKeyEvent: boolean;
  count: number;
};

export function buildEventEvidence(profile: ClientProfile, ga4Data?: GA4AuditData): EventEvidence[] {
  const events = ga4Data?.eventsLast7Days || [];
  const eventNames = new Set((ga4Data?.eventsList || events.map((event) => event.eventName)).map(normaliseName));
  const conversions = new Set((ga4Data?.conversions || []).map((conversion) => normaliseName(conversion.name)));

  return profile.expectedEvents.map((expectedEvent) => {
    const synonyms = [expectedEvent.eventName, ...(expectedEvent.matchingEventNames || [])].map(normaliseName);
    const exactMatch = eventNames.has(normaliseName(expectedEvent.eventName)) ? expectedEvent.eventName : undefined;
    const matchedEvent = events.find((event) => synonyms.includes(normaliseName(event.eventName)));
    const synonymMatch = matchedEvent?.eventName;
    const present = Boolean(exactMatch || synonymMatch);
    const nonStandardName = present && !exactMatch ? synonymMatch : undefined;
    const isKeyEvent = synonyms.some((name) => conversions.has(name));
    return {
      expectedEvent,
      exactMatch,
      synonymMatch,
      present,
      nonStandardName,
      isKeyEvent,
      count: matchedEvent?.count || 0
    };
  });
}

export function findGtmTriggerForCta(gtmData: GTMAuditData | undefined, label: string, urlPattern?: string, type?: string) {
  const haystack = [...(gtmData?.triggers || []), ...(gtmData?.tags || [])].map((item) => `${item.name} ${item.type}`).join(' ').toLowerCase();
  const terms = [type, label, urlPattern].filter(Boolean).map((value) => String(value).toLowerCase());
  return terms.some((term) => haystack.includes(term) || (term.includes('wa.me') && haystack.includes('whatsapp')));
}

export function findGtmTagForEvent(gtmData: GTMAuditData | undefined, eventName: string, synonyms: string[] = []) {
  const names = [eventName, ...synonyms].map(normaliseName);
  return (gtmData?.tags || []).some((tag) => names.some((name) => normaliseName(`${tag.name} ${tag.type}`).includes(name)));
}

export function detectPlatformTags(gtmData?: GTMAuditData) {
  const text = (gtmData?.tags || []).map((tag) => `${tag.name} ${tag.type}`).join(' ').toLowerCase();
  return {
    meta: /meta|facebook|fb pixel|facebook pixel/.test(text),
    tiktok: /tiktok|tik tok/.test(text),
    linkedin: /linkedin|insight/.test(text),
    googleAds: /google ads|ads conversion|awct/.test(text)
  };
}

export function summariseWebsite(snapshot?: WebsiteSnapshot) {
  const pages = snapshot?.pages || [];
  return {
    forms: pages.reduce((sum, page) => sum + page.formsDetected, 0),
    phoneLinks: pages.reduce((sum, page) => sum + page.phoneLinks.length, 0),
    emailLinks: pages.reduce((sum, page) => sum + page.emailLinks.length, 0),
    whatsappLinks: pages.reduce((sum, page) => sum + page.whatsappLinks.length, 0),
    importantPages: pages.filter((page) => page.pageType && page.pageType !== 'unknown').length,
    thankYouPages: pages.filter((page) => page.pageType === 'thank_you').length
  };
}
