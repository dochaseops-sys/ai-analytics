import { AuditRule, AuditResult } from '../types';
import { findMatchingName, findMatchingConversion, findGtmTagByName, getSummaryList } from './rule-utils';

const leadEventPatterns = [
  'generate_lead', 'lead', 'sign_up', 'signup',
  'registration', 'register', 'complete_registration',
  'contact', 'contact_us', 'new_lead', 'form_submit'
];

export const leadExistsRule: AuditRule = {
  id: 'lead-exists',
  name: 'Lead Event Tracking',
  category: 'Conversion Tracking',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const eventNames = context.ga4Data?.eventsList ?? [];
    const matchedEvent = findMatchingName(eventNames, leadEventPatterns);
    const matchedConversion = findMatchingConversion(context.ga4Data?.conversions, leadEventPatterns);
    const matchedGtmTag = findGtmTagByName(context.gtmData?.tags, leadEventPatterns);
    const hasLeadEvent = !!context.ga4Data?.hasLeadEvent || !!matchedEvent || !!matchedConversion || !!matchedGtmTag;

    let description = '';
    let recommendation = 'Confirm that lead parameters (like lead source or value) are being collected.';

    if (hasLeadEvent) {
      if (matchedEvent) {
        description = `Lead generation event tracking is active (detected "${matchedEvent}" in GA4 events).`;
      } else if (matchedConversion) {
        description = `Lead generation tracking is active (detected conversion "${matchedConversion.name}" in GA4).`;
      } else if (matchedGtmTag) {
        description = `Lead generation tracking appears configured in GTM (tag "${matchedGtmTag.name}"). Verify that this tag is firing and sending data to GA4.`;
      } else {
        description = 'Lead generation event tracking is active and receiving data.';
      }
    } else {
      const detectedForms = context.websiteScan?.detectedLeadForms ?? [];
      const keyActions = context.websiteScan?.keyActions ?? [];
      const suggestedActions = getSummaryList([...detectedForms, ...keyActions], 4);

      description = 'No lead generation events were detected in GA4.';
      recommendation = suggestedActions
        ? `Set up the GA4 standard 'generate_lead' event to fire for these key actions: ${suggestedActions}.`
        : 'Set up the GA4 standard "generate_lead" event on your lead capture forms and thank-you pages.';
    }

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description,
      recommendation,
      category: this.category,
      passed: hasLeadEvent
    };
  }
};
