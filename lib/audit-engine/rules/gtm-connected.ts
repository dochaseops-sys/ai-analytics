import { AuditRule, AuditResult } from '../types';

export const gtmConnectedRule: AuditRule = {
  id: 'gtm-connected',
  name: 'GTM Container Connected',
  category: 'GTM Setup',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const passed = !!context.gtmContainerId;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? 'A Google Tag Manager container is connected and active for this client.'
        : 'No Google Tag Manager container is connected. Tag triggers and setups cannot be audited.',
      recommendation: passed
        ? 'Confirm that GTM snippet is installed correctly in the <head> and <body> of the website.'
        : 'Go to Client Connections and link a Google Tag Manager container.',
      category: this.category,
      passed
    };
  }
};
