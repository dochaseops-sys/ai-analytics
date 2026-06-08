import { adminDb } from '@/lib/firebase-admin';
import { generateContentWithRetry } from '@/lib/gemini';
import { analyzeRequirements } from './requirements';
import { buildCustomHtmlParameters } from './tag-templates/custom-html';
import { buildGA4EventParameters } from './tag-templates/ga4-event';
import { buildMetaPixelParameters } from './tag-templates/meta';
import { buildTikTokPixelParameters } from './tag-templates/tiktok';
import { implementationPlanSchema, ImplementationPlan, RequirementContext } from './types';
import { validateImplementationPlan } from './validators';

const normalizeTriggerName = (trigger: string) => {
  if (trigger === 'all_pages' || trigger === 'pageview') return 'All Pages';
  if (trigger === 'form_submit') return 'All Form Submissions';
  if (trigger === 'click') return 'Click Trigger';
  return trigger;
};

function triggerTypeFromValue(trigger: string): 'pageview' | 'click' | 'form_submit' | 'custom_event' {
  if (trigger === 'all_pages' || trigger === 'pageview') return 'pageview';
  if (trigger === 'form_submit') return 'form_submit';
  if (trigger === 'click') return 'click';
  return 'custom_event';
}

function recommendationContextValue(recommendation: unknown, key: string) {
  if (!recommendation || typeof recommendation !== 'object') return '';
  const context = (recommendation as Record<string, unknown>).implementationContext;
  if (!context || typeof context !== 'object') return '';
  const value = (context as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function planId() {
  return adminDb.collection('implementation_plans').doc().id;
}

export async function getConnectedContext(clientId: string) {
  const [gtmDoc, ga4Doc] = await Promise.all([
    adminDb.collection('gtm_containers').doc(clientId).get(),
    adminDb.collection('ga4_properties').doc(clientId).get()
  ]);

  const gtm = gtmDoc.exists ? gtmDoc.data() : null;
  const ga4 = ga4Doc.exists ? ga4Doc.data() : null;

  return {
    accountId: gtm?.accountId as string | undefined,
    containerId: gtm?.containerId as string | undefined,
    containerName: gtm?.containerName as string | undefined,
    ga4PropertyId: ga4?.propertyId as string | undefined,
    ga4MeasurementId: ga4?.measurementId as string | undefined
  };
}

async function askGeminiForPlanSummary(context: RequirementContext, inferred: Record<string, string>) {
  try {
    const prompt = `Return JSON only. Summarize this GTM implementation request for a marketer.
Input:
${JSON.stringify({ command: context.command, recommendation: context.recommendation, inferred }, null, 2)}

Schema:
{"summary":"Short implementation summary","riskLevel":"low|medium|high"}`;

    const text = await generateContentWithRetry(prompt, {
      responseMimeType: 'application/json',
      temperature: 0.2
    });
    const parsed = JSON.parse(text);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      riskLevel: ['low', 'medium', 'high'].includes(parsed.riskLevel) ? parsed.riskLevel : undefined
    };
  } catch (error) {
    console.warn('Gemini implementation summary failed; using deterministic summary.', error);
    return {};
  }
}

export async function createImplementationPlan(context: RequirementContext): Promise<{
  plan: ImplementationPlan;
  warnings: string[];
  errors: string[];
}> {
  const connected = await getConnectedContext(context.clientId);

  if (!connected.containerId) {
    throw new Error('GTM Container is not connected to this client.');
  }

  const mergedContext = {
    ...context,
    ga4MeasurementId: context.ga4MeasurementId || connected.ga4MeasurementId
  };
  const analysis = analyzeRequirements(mergedContext);

  if (analysis.missing.length > 0) {
    throw new Error(`Missing required information: ${analysis.missing.map((item) => item.field).join(', ')}`);
  }

  const inferred = analysis.inferred;
  const triggerName = normalizeTriggerName(inferred.trigger);
  const triggerType = triggerTypeFromValue(inferred.trigger);
  const actions: ImplementationPlan['actions'] = [
    {
      action: 'create_trigger',
      name: triggerName,
      triggerType,
      conditions:
        inferred.trigger === 'click'
          ? [{
              variable: recommendationContextValue(context.recommendation, 'selectorHint') ? 'Click Element' : 'Click URL',
              operator: 'contains',
              value: recommendationContextValue(context.recommendation, 'urlPattern') || recommendationContextValue(context.recommendation, 'selectorHint') || (context.command.toLowerCase().includes('whatsapp') ? 'wa.me' : 'http')
            }]
          : inferred.trigger === 'pageview' && recommendationContextValue(context.recommendation, 'urlPattern')
            ? [{ variable: 'Page URL', operator: 'contains', value: recommendationContextValue(context.recommendation, 'urlPattern') }]
            : undefined
    }
  ];

  let tagName = 'Tracking Tag';
  let parameters: Record<string, string> | undefined;
  let html: string | undefined;

  let isPageView = false;
  if (analysis.tagIntent === 'meta_pixel') {
    tagName = 'Meta Pixel';
    parameters = buildMetaPixelParameters(inferred.pixelId, inferred.eventName || 'PageView');
    html = parameters.html;
  } else if (analysis.tagIntent === 'tiktok_pixel') {
    tagName = 'TikTok Pixel';
    parameters = buildTikTokPixelParameters(inferred.pixelId, inferred.eventName || (context.command.toLowerCase().includes('lead') ? 'SubmitForm' : 'PageView'));
    html = parameters.html;
  } else if (analysis.tagIntent === 'ga4_event') {
    isPageView =
      inferred.eventName?.toLowerCase().includes('pageview') ||
      inferred.eventName?.toLowerCase().includes('page_view') ||
      inferred.eventName?.toLowerCase().includes('page view') ||
      context.command.toLowerCase().includes('page view') ||
      context.command.toLowerCase().includes('pageview');

    if (isPageView) {
      tagName = 'Google Tag';
      parameters = {
        measurementId: inferred.measurementId || ''
      };
    } else {
      tagName = `GA4 Event - ${inferred.eventName}`;
      parameters = buildGA4EventParameters(inferred.measurementId, inferred.eventName);
    }
  } else if (analysis.tagIntent === 'custom_html') {
    tagName = 'Custom HTML Third-Party Tag';
    parameters = buildCustomHtmlParameters(inferred.html);
    html = inferred.html;
  }

  const aiSummary = await askGeminiForPlanSummary(context, inferred);
  const summary = aiSummary.summary || `Create ${tagName} in GTM.`;
  const workspaceName = `Tracking Health AI - ${summary.slice(0, 48)} - ${new Date().toISOString().slice(0, 10)}`
    .replace(/:/g, '-')
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim();

  const resolvedTagType =
    analysis.tagIntent === 'ga4_event' && isPageView
      ? 'google_tag'
      : (analysis.tagIntent === 'unknown' ? 'custom_html' : analysis.tagIntent);

  actions.push({
    action: 'create_tag',
    name: tagName,
    tagType: resolvedTagType,
    html,
    parameters,
    triggerName
  });

  const draft: ImplementationPlan = {
    id: planId(),
    clientId: context.clientId,
    containerId: connected.containerId,
    workspaceName,
    status: 'ready_for_approval',
    riskLevel: aiSummary.riskLevel || 'low',
    summary,
    actions
  };

  const parsed = implementationPlanSchema.parse(draft);
  const validation = validateImplementationPlan(parsed);

  const cleanPlan = JSON.parse(JSON.stringify({
    ...parsed,
    riskLevel: validation.riskLevel,
    status: validation.valid ? 'ready_for_approval' : 'draft'
  }));

  return {
    plan: cleanPlan,
    warnings: validation.warnings,
    errors: validation.errors
  };
}
