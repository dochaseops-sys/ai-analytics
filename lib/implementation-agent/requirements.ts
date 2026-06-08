import { RequirementContext } from './types';

type MissingRequirement = {
  field: string;
  question: string;
};

export type RequirementAnalysis = {
  tagIntent: 'meta_pixel' | 'tiktok_pixel' | 'ga4_event' | 'custom_html' | 'unknown';
  missing: MissingRequirement[];
  inferred: Record<string, string>;
};

const getAnswer = (answers: Record<string, string> | undefined, key: string) => {
  const value = answers?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const recommendationValue = (recommendation: unknown, key: string) => {
  if (!recommendation || typeof recommendation !== 'object') return '';
  const value = (recommendation as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
};

const recommendationContextValue = (recommendation: unknown, key: string) => {
  if (!recommendation || typeof recommendation !== 'object') return '';
  const context = (recommendation as Record<string, unknown>).implementationContext;
  if (!context || typeof context !== 'object') return '';
  const value = (context as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
};

const recommendationImplementationType = (recommendation: unknown) => {
  const value = recommendationValue(recommendation, 'implementationType').toLowerCase();
  return value;
};

export function detectTagIntent(command: string, recommendation?: unknown, answers?: Record<string, string>): RequirementAnalysis['tagIntent'] {
  const answeredType = answers?.tagType?.toLowerCase() || '';
  if (answeredType.includes('meta')) return 'meta_pixel';
  if (answeredType.includes('tiktok') || answeredType.includes('tik tok')) return 'tiktok_pixel';
  if (answeredType.includes('ga4') || answeredType.includes('google analytics') || answeredType.includes('event')) return 'ga4_event';
  if (answeredType.includes('html') || answeredType.includes('custom') || answeredType.includes('script')) return 'custom_html';

  const issueId = recommendationValue(recommendation, 'issueId');
  const implementationType = recommendationImplementationType(recommendation);
  const text = `${command} ${recommendationValue(recommendation, 'title')} ${recommendationValue(recommendation, 'recommendation')} ${issueId}`.toLowerCase();

  if (implementationType.includes('meta')) return 'meta_pixel';
  if (implementationType.includes('tiktok')) return 'tiktok_pixel';
  if (implementationType.includes('ga4') || implementationType.includes('gtm_trigger')) return 'ga4_event';
  if (implementationType.includes('custom_html')) return 'custom_html';

  if (text.includes('meta') || text.includes('facebook pixel')) return 'meta_pixel';
  if (text.includes('tiktok') || text.includes('tik tok')) return 'tiktok_pixel';
  if (text.includes('ga4') || text.includes('whatsapp') || text.includes('form_submit') || text.includes('generate_lead') || text.includes('event')) return 'ga4_event';
  if (text.includes('third-party') || text.includes('script') || text.includes('custom html') || /<script/i.test(command)) return 'custom_html';

  if (issueId === 'form-submit-exists' || issueId === 'lead-exists') {
    return 'ga4_event';
  }

  return 'unknown';
}

export function analyzeRequirements(context: RequirementContext): RequirementAnalysis {
  const tagIntent = detectTagIntent(context.command, context.recommendation, context.answers);
  const answers = context.answers || {};
  const missing: MissingRequirement[] = [];
  const inferred: Record<string, string> = {};
  const command = context.command.toLowerCase();

  const trigger = getAnswer(answers, 'trigger') || (command.includes('all pages') ? 'all_pages' : undefined);
  const recommendationTrigger = recommendationContextValue(context.recommendation, 'triggerType');
  if (trigger) inferred.trigger = trigger;

  if (tagIntent === 'meta_pixel') {
    const pixelId = getAnswer(answers, 'pixelId') || getAnswer(answers, 'metaPixelId') || context.command.match(/\b\d{8,25}\b/)?.[0];
    if (pixelId) inferred.pixelId = pixelId;
    else missing.push({ field: 'pixelId', question: 'What is the Meta Pixel ID?' });

    if (!trigger) {
      missing.push({ field: 'trigger', question: 'Should this fire on all pages or only specific pages?' });
    }
  }

  if (tagIntent === 'tiktok_pixel') {
    const pixelId = getAnswer(answers, 'pixelId') || getAnswer(answers, 'tiktokPixelId');
    if (pixelId) inferred.pixelId = pixelId;
    else missing.push({ field: 'pixelId', question: 'What is the TikTok Pixel ID?' });

    if (!trigger) {
      missing.push({ field: 'trigger', question: 'Should this fire on all pages or only specific pages?' });
    }
  }

  if (tagIntent === 'ga4_event') {
    const measurementId = getAnswer(answers, 'measurementId') || context.ga4MeasurementId;
    if (measurementId) inferred.measurementId = measurementId;
    else missing.push({ field: 'measurementId', question: 'What is the GA4 measurement ID, such as G-XXXXXXXXXX?' });

    const eventName =
      getAnswer(answers, 'eventName') ||
      recommendationContextValue(context.recommendation, 'eventName') ||
      (command.includes('whatsapp') ? 'whatsapp_click' : undefined) ||
      (command.includes('lead') ? 'generate_lead' : undefined) ||
      (command.includes('form_submit') || recommendationValue(context.recommendation, 'issueId') === 'form-submit-exists' ? 'form_submit' : undefined);
    if (eventName) inferred.eventName = eventName;
    else missing.push({ field: 'eventName', question: 'What GA4 event name should be created?' });

    const inferredTrigger = trigger || recommendationTrigger || (command.includes('whatsapp') ? 'click' : recommendationValue(context.recommendation, 'issueId') === 'form-submit-exists' ? 'form_submit' : undefined);
    if (inferredTrigger) inferred.trigger = inferredTrigger;
    else missing.push({ field: 'trigger', question: 'What user action or page condition should fire this event?' });
  }

  if (tagIntent === 'custom_html') {
    const html = getAnswer(answers, 'html') || (/<script/i.test(context.command) ? context.command : undefined);
    if (html) inferred.html = html;
    else missing.push({ field: 'html', question: 'Paste the third-party HTML or script that should be implemented.' });

    if (!trigger) {
      missing.push({ field: 'trigger', question: 'Should this custom HTML fire on all pages or only specific pages/actions?' });
    }
  }

  if (tagIntent === 'unknown') {
    missing.push({ field: 'tagType', question: 'Which tag type should be created: Meta Pixel, TikTok Pixel, GA4 event, or Custom HTML?' });
  }

  return { tagIntent, missing, inferred };
}

export function buildNeedsInfoQuestions(analysis: RequirementAnalysis) {
  return {
    missingFields: analysis.missing.map((item) => item.field),
    questions: analysis.missing.map((item) => item.question)
  };
}
