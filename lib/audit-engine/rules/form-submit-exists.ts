import { AuditRule, AuditResult } from '../types';
import { findMatchingName, findGtmTagByName, getSummaryList, normalizeName } from './rule-utils';

const leadEventPatterns = [
  'generate_lead', 'lead', 'sign_up', 'signup',
  'registration', 'register', 'complete_registration',
  'contact', 'contact_us', 'new_lead', 'form_submit'
];

const formSubmitPatterns = [
  'form_submit', 'submit_form', 'form submission',
  'contact form', 'signup form', 'registration form', 'form completion'
];

export const formSubmitExistsRule: AuditRule = {
  id: 'form-submit-exists',
  name: 'Form Submit Event Tracking',
  category: 'Event Quality',
  severity: 'medium',
  async run(context): Promise<AuditResult> {
    const eventNames = context.ga4Data?.eventsList ?? [];
    const hasFormSubmitEvent = !!context.ga4Data?.hasFormSubmitEvent || !!findMatchingName(eventNames, formSubmitPatterns);
    const hasLeadEvent = !!context.ga4Data?.hasLeadEvent || !!findMatchingName(eventNames, leadEventPatterns);
    const hasLeadConversion = !!context.ga4Data?.conversions?.some((c) => findMatchingName([c.name], leadEventPatterns));
    const hasLeadTag = !!findGtmTagByName(context.gtmData?.tags, leadEventPatterns);
    const hasFormTrigger = !!context.gtmData?.triggers?.some((trigger) => {
      const name = normalizeName(trigger.name || '');
      return trigger.type === 'formSubmission' || formSubmitPatterns.some((pattern) => name.includes(normalizeName(pattern)));
    });

    const passed = hasFormSubmitEvent || hasLeadEvent || hasLeadConversion || hasLeadTag || hasFormTrigger;

    const explanationParts: string[] = [];
    if (hasFormSubmitEvent) explanationParts.push('GA4 form submit events are present');
    if (hasLeadEvent) explanationParts.push('GA4 lead events are present');
    if (hasLeadConversion) explanationParts.push('lead conversions are configured in GA4');
    if (hasLeadTag) explanationParts.push('a GTM tag exists for lead/form interaction tracking');
    if (hasFormTrigger) explanationParts.push('a GTM form submission trigger is present');

    let description = '';
    let recommendation = '';

    if (passed) {
      description = `Form submission tracking is detected: ${getSummaryList(explanationParts)}.`;
      recommendation = hasFormSubmitEvent || hasFormTrigger
        ? 'Keep tracking active forms and capture form IDs or page paths so form submissions are clearly attributable in GA4.'
        : 'Review the existing lead/form tracking setup and ensure GA4 receives form submission events from all key capture points.';
    } else {
      const detectedForms = context.websiteScan?.detectedLeadForms ?? [];
      const keyActions = context.websiteScan?.keyActions ?? [];
      const summaryActions = getSummaryList([...detectedForms, ...keyActions], 4);

      description = 'No form submission or lead generation tracking could be confirmed in GA4 or GTM.';
      recommendation = summaryActions
        ? `Configure form submission tracking for the following key actions: ${summaryActions}. Use GA4 event names like 'form_submit' or 'generate_lead'.`
        : 'Enable GA4 form submission tracking using Enhanced Measurement or a custom GTM form trigger, then verify events appear in GA4.';
    }

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description,
      recommendation,
      category: this.category,
      passed
    };
  }
};
