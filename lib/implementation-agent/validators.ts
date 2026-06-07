import { implementationPlanSchema, ImplementationPlan, PlanValidationResult, RiskLevel } from './types';

const trustedDomains = [
  'connect.facebook.net',
  'www.facebook.com',
  'analytics.tiktok.com',
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'ssl.google-analytics.com'
];

const personalIdentifierPatterns = [
  /email/i,
  /phone/i,
  /first[_-]?name/i,
  /last[_-]?name/i,
  /full[_-]?name/i,
  /address/i,
  /user[_-]?id/i
];

function extractScriptDomains(html: string) {
  const domains = new Set<string>();
  const srcMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
  for (const match of srcMatches) {
    try {
      const url = new URL(match[1], 'https://example.com');
      if (url.hostname !== 'example.com') domains.add(url.hostname);
    } catch {
      // Invalid URLs are handled by browser/GTM; keep validation focused on safety.
    }
  }
  return Array.from(domains);
}

export function validateCustomHtml(html: string) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (/\beval\s*\(/i.test(html)) {
    errors.push('Custom HTML cannot include eval().');
  }

  if (/document\.write\s*\(/i.test(html)) {
    errors.push('Custom HTML cannot include document.write().');
  }

  for (const domain of extractScriptDomains(html)) {
    if (!trustedDomains.includes(domain)) {
      warnings.push(`Unknown external script domain: ${domain}`);
    }
  }

  if (personalIdentifierPatterns.some((pattern) => pattern.test(html))) {
    warnings.push('This script may collect email, phone, name, address, user ID, or other personal identifiers.');
  }

  return { errors, warnings };
}

export function validateImplementationPlan(plan: ImplementationPlan): PlanValidationResult {
  const parsed = implementationPlanSchema.safeParse(plan);
  const errors: string[] = [];
  const warnings: string[] = [];
  let riskLevel: RiskLevel = plan.riskLevel || 'low';

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
    return { valid: false, warnings, errors, riskLevel: 'high' };
  }

  const actionKeys = new Set<string>();
  const triggerNames = new Set<string>();

  for (const action of plan.actions) {
    const key = `${action.action}:${action.name.toLowerCase()}`;
    if (actionKeys.has(key)) {
      errors.push(`Duplicate action in plan: ${action.name}`);
    }
    actionKeys.add(key);

    if (action.action === 'create_trigger') {
      triggerNames.add(action.name);
    }
  }

  for (const action of plan.actions) {
    if (action.action === 'create_tag' && !triggerNames.has(action.triggerName)) {
      errors.push(`Tag "${action.name}" references missing trigger "${action.triggerName}".`);
    }

    if (action.action === 'create_tag') {
      const html = action.html || action.parameters?.html;
      if (html) {
        const htmlValidation = validateCustomHtml(html);
        errors.push(...htmlValidation.errors.map((message) => `${action.name}: ${message}`));
        warnings.push(...htmlValidation.warnings.map((message) => `${action.name}: ${message}`));
      }

      const firesOnAllPages = plan.actions.some(
        (candidate) =>
          candidate.action === 'create_trigger' &&
          candidate.name === action.triggerName &&
          candidate.triggerType === 'pageview' &&
          (!candidate.conditions || candidate.conditions.length === 0)
      );

      if (firesOnAllPages && ['meta_pixel', 'tiktok_pixel', 'custom_html'].includes(action.tagType)) {
        warnings.push(`Consent warning: "${action.name}" fires a third-party tag on all pages.`);
        if (riskLevel === 'low') riskLevel = 'medium';
      }

      if (action.tagType === 'custom_html' && riskLevel === 'low') {
        riskLevel = 'medium';
      }
    }
  }

  if (errors.length > 0) {
    riskLevel = 'high';
  } else if (warnings.some((warning) => warning.toLowerCase().includes('personal identifiers'))) {
    riskLevel = 'high';
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    riskLevel
  };
}
