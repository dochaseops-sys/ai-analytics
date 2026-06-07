import { AuditRule, AuditResult } from '../types';

export const conversionsConfiguredRule: AuditRule = {
  id: 'conversions-configured',
  name: 'Conversions Configured',
  category: 'Conversion Tracking',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const conversionsList = context.ga4Data?.conversions ?? [];
    const passed = conversionsList.length > 0;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? `Detected ${conversionsList.length} configured conversion event(s) in GA4: ${conversionsList.map(c => c.name).join(', ')}.`
        : 'No conversion events are configured in GA4. Conversion rates and attribution will not work.',
      recommendation: passed
        ? 'Ensure your key business goals (e.g. purchases, signups, lead forms) are marked as conversions.'
        : 'Go to GA4 Admin > Conversions, and mark your key event names (like "generate_lead" or "purchase") as conversion events.',
      category: this.category,
      passed
    };
  }
};
