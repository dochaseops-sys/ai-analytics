import { AuditRule, AuditResult } from '../types';

export const consentModeRule: AuditRule = {
  id: 'consent-mode',
  name: 'Consent Mode Configured',
  category: 'Privacy & Consent',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const passed = !!context.gtmData?.hasConsentModeTag;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? 'Google Consent Mode configuration detected in your Google Tag Manager container.'
        : 'Consent Mode configuration is missing. Analytics and advertising tags may be firing without user consent.',
      recommendation: passed
        ? 'Ensure Consent Mode defaults are set properly (denied by default, updated on consent update).'
        : 'Implement Google Consent Mode in GTM using a consent manager template (e.g. Cookiebot, OneTrust) or a custom HTML tag.',
      category: this.category,
      passed
    };
  }
};
