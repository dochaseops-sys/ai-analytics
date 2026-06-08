import { classifyCTA, normalizeDetectedCTAs } from './cta-extractor';
import { classifyIndustryDeterministically, refineClassificationWithGemini } from './industry-classifier';
import { classifyPageIntent } from './page-type-classifier';
import { buildExpectedEvents } from './expected-events-builder';
import { ClientProfile, DetectedAdPlatform, WebsiteSnapshot } from './types';

export async function profileWebsiteSnapshot(clientId: string, snapshot: WebsiteSnapshot): Promise<Omit<ClientProfile, 'id' | 'createdAt' | 'updatedAt'>> {
  const deterministic = classifyIndustryDeterministically(snapshot);
  const gemini = await refineClassificationWithGemini(snapshot, deterministic);
  const classification = gemini && gemini.confidence >= Math.max(0.55, deterministic.confidence - 0.1)
    ? { ...deterministic, ...gemini }
    : deterministic;

  const detectedCTAs = normalizeDetectedCTAs(snapshot.pages);
  const importantPages = snapshot.pages
    .filter((page) => page.pageType && page.pageType !== 'unknown')
    .map((page) => ({
      url: page.url,
      pageType: page.pageType || 'unknown',
      detectedIntent: classifyPageIntent(page.pageType || 'unknown')
    }))
    .slice(0, 80);
  const expectedEvents = buildExpectedEvents(classification.businessModel, detectedCTAs);
  const detectedAdPlatforms = detectAdPlatforms(snapshot);

  return {
    clientId,
    websiteUrl: snapshot.websiteUrl,
    industry: classification.industry,
    businessModel: classification.businessModel,
    funnelType: classification.funnelType,
    primaryConversionGoals: classification.primaryConversionGoals,
    secondaryConversionGoals: classification.secondaryConversionGoals,
    detectedCTAs,
    importantPages,
    expectedEvents,
    detectedAdPlatforms,
    confidence: classification.confidence,
    needsReview: classification.confidence < 0.55,
    reasoningSummary: classification.reasoningSummary
  };
}

function detectAdPlatforms(snapshot: WebsiteSnapshot): DetectedAdPlatform[] {
  const text = JSON.stringify(snapshot.pages.flatMap((page) => page.ctas.map((cta) => `${cta.label} ${cta.href || ''}`))).toLowerCase();
  const platforms: DetectedAdPlatform[] = [];
  if (/gclid|googleadservices|google ads/.test(text)) platforms.push('google_ads');
  if (/facebook|instagram|fbclid|meta/.test(text)) platforms.push('meta');
  if (/tiktok/.test(text)) platforms.push('tiktok');
  if (/linkedin|li_fat_id/.test(text)) platforms.push('linkedin');
  if (/twitter|x\.com/.test(text)) platforms.push('x');
  if (/pinterest/.test(text)) platforms.push('pinterest');
  return platforms.length ? platforms : ['unknown'];
}

export { classifyCTA };
