import { AuditRule, AuditResult } from '../types';
import { findMatchingConversion } from './rule-utils';

const keyConversionPatterns = [
  'purchase', 'generate_lead', 'lead', 'sign_up', 'signup',
  'registration', 'register', 'complete_registration', 'contact', 'contact_us'
];

export const conversionsConfiguredRule: AuditRule = {
  id: 'conversions-configured',
  name: 'Conversions Configured',
  category: 'Conversion Tracking',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const conversionsList = context.ga4Data?.conversions ?? [];
    const matchedImportantConversion = findMatchingConversion(conversionsList, keyConversionPatterns);
    const passed = conversionsList.length > 0;
    const conversionNames = conversionsList.map((c) => c.name);

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? `Detected ${conversionsList.length} configured conversion event(s) in GA4: ${conversionNames.join(', ')}.`
        : 'No conversion events are configured in GA4. Conversion rates and attribution will not work.',
      recommendation: passed
        ? matchedImportantConversion
          ? `Verify that your key business goals (${matchedImportantConversion.name}) are properly marked as conversions and that their event parameters are accurate.`
          : 'Review GA4 conversions and ensure your top lead, signup, and purchase actions are marked as conversions.'
        : 'Go to GA4 Admin > Conversions, and mark your key event names (like "generate_lead" or "purchase") as conversion events.',
      category: this.category,
      passed
    };
  }
};
