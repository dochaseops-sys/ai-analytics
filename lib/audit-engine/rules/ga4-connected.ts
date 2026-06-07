import { AuditRule, AuditResult } from '../types';

export const ga4ConnectedRule: AuditRule = {
  id: 'ga4-connected',
  name: 'GA4 Property Connected',
  category: 'GA4 Setup',
  severity: 'critical',
  async run(context): Promise<AuditResult> {
    const passed = !!context.ga4PropertyId;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? 'A Google Analytics 4 property is connected and active for this client.'
        : 'No Google Analytics 4 property is connected. Data cannot be tracked or audited.',
      recommendation: passed
        ? 'Ensure the connected property matches your production site tracking ID.'
        : 'Go to Client Connections and link a Google Analytics 4 property.',
      category: this.category,
      passed
    };
  }
};
