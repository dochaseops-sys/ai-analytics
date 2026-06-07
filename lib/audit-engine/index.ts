import { AuditContext, AuditResult, AuditRule } from './types';
import { generateContentWithRetry } from '../gemini';
import { ga4ConnectedRule } from './rules/ga4-connected';
import { gtmConnectedRule } from './rules/gtm-connected';
import { purchaseExistsRule } from './rules/purchase-exists';
import { leadExistsRule } from './rules/lead-exists';
import { formSubmitExistsRule } from './rules/form-submit-exists';
import { duplicateEventsRule } from './rules/duplicate-events';
import { consentModeRule } from './rules/consent-mode';
import { events7DaysRule } from './rules/events-7days';
import { conversionsConfiguredRule } from './rules/conversions-configured';
import { gtmNoTriggersRule } from './rules/gtm-no-triggers';

const rules: AuditRule[] = [
  ga4ConnectedRule,
  gtmConnectedRule,
  purchaseExistsRule,
  leadExistsRule,
  formSubmitExistsRule,
  duplicateEventsRule,
  consentModeRule,
  events7DaysRule,
  conversionsConfiguredRule,
  gtmNoTriggersRule
];

export async function runAudit(context: AuditContext) {
  const results: AuditResult[] = [];
  
  for (const rule of rules) {
    try {
      const res = await rule.run(context);
      results.push(res);
    } catch (err) {
      results.push({
        issueId: rule.id,
        severity: rule.severity,
        title: rule.name,
        description: `Error running rule: ${(err as Error).message}`,
        recommendation: 'Check connection setup and try again.',
        category: rule.category,
        passed: false
      });
    }
  }

  // Batch-process AI refinement for failed issues
  const failedResults = results.filter(r => !r.passed);
  if (failedResults.length > 0) {
    try {
      const prompt = `You are a web analytics expert. The following audit rules failed for a client in the "${context.industry || 'General'}" industry.

Website Context:
URL: ${context.websiteUrl || 'Unknown'}
Business Type: ${context.websiteScan?.businessType || 'Unknown'}
Key Actions: ${context.websiteScan?.keyActions?.join(', ') || 'None'}

Failed Rules:
${failedResults.map(r => `- ID: ${r.issueId}\n  Title: ${r.title}\n  Current Recommendation: ${r.recommendation}`).join('\n\n')}

Please provide a highly tailored, actionable 1-2 sentence recommendation for each failed rule, specialized for their industry and website. 
IMPORTANT: Your new recommendation MUST explicitly reference their specific business type or key actions so the client knows it is personalized.
Return the result as a JSON array of objects, with each object containing "issueId" and "tailoredRecommendation". Return ONLY valid JSON.`;

      const aiResponse = await generateContentWithRetry(prompt, {
        temperature: 0.7,
        responseMimeType: 'application/json'
      });

      let cleanJson = aiResponse;
      // Strip markdown code blocks if the model wrapped it
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
      }
      
      let parsedRefinements = [];
      try {
        parsedRefinements = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.error('Failed to parse AI JSON:', cleanJson);
        throw parseErr;
      }
      
      for (const refinement of parsedRefinements) {
        const res = results.find(r => r.issueId === refinement.issueId);
        const newRec = refinement.tailoredRecommendation || refinement.recommendation;
        if (res && newRec) {
          res.recommendation = newRec;
        }
      }
    } catch (aiError) {
      console.warn('Failed to batch-refine recommendations with AI:', aiError);
    }
  }

  // Calculate scores
  let ga4SetupScore = 0;
  let gtmSetupScore = 0;
  let conversionScore = 0;
  let eventQualityScore = 0;
  let privacyScore = 0;

  // Helper to find rule result
  const getRuleResult = (id: string) => results.find(r => r.issueId === id);

  // 1. GA4 Setup (25 points)
  const ga4Connected = getRuleResult('ga4-connected')?.passed ?? false;
  if (ga4Connected) {
    ga4SetupScore = 25;
  }

  // 2. GTM Setup (25 points)
  const gtmConnected = getRuleResult('gtm-connected')?.passed ?? false;
  if (gtmConnected) {
    gtmSetupScore += 15;
    const gtmNoTriggers = getRuleResult('gtm-no-triggers');
    if (gtmNoTriggers && gtmNoTriggers.passed) {
      gtmSetupScore += 10;
    }
  }

  // 3. Conversion Tracking (25 points)
  if (ga4Connected) {
    const purchaseExists = getRuleResult('purchase-exists')?.passed ?? false;
    const leadExists = getRuleResult('lead-exists')?.passed ?? false;
    const conversionsConfigured = getRuleResult('conversions-configured')?.passed ?? false;

    if (purchaseExists) conversionScore += 8;
    if (leadExists) conversionScore += 8;
    if (conversionsConfigured) conversionScore += 9;
  }

  // 4. Event Quality (15 points)
  if (ga4Connected) {
    const formSubmitExists = getRuleResult('form-submit-exists')?.passed ?? false;
    const duplicateEvents = getRuleResult('duplicate-events')?.passed ?? false;
    const events7Days = getRuleResult('events-7days')?.passed ?? false;

    if (formSubmitExists) eventQualityScore += 5;
    if (duplicateEvents) eventQualityScore += 5; // Passed means no duplicate events detected
    if (events7Days) eventQualityScore += 5;
  }

  // 5. Privacy & Consent (10 points)
  const consentMode = getRuleResult('consent-mode')?.passed ?? false;
  if (consentMode) {
    privacyScore = 10;
  }

  const score = ga4SetupScore + gtmSetupScore + conversionScore + eventQualityScore + privacyScore;

  // Grade calculation
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';

  return {
    score,
    grade,
    issues: results.filter(r => !r.passed),
    results,
    categoryScores: {
      ga4Setup: { score: ga4SetupScore, max: 25 },
      gtmSetup: { score: gtmSetupScore, max: 25 },
      conversionTracking: { score: conversionScore, max: 25 },
      eventQuality: { score: eventQualityScore, max: 15 },
      privacyConsent: { score: privacyScore, max: 10 }
    }
  };
}
