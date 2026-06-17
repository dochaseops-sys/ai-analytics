import { AuditRule, AuditResult } from '../types';
import { findGtmTagByName } from './rule-utils';

export const leadExistsRule: AuditRule = {
  id: 'lead-exists',
  name: 'Lead Event Tracking',
  category: 'Conversion Tracking',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const leadEventNames = context.leadEventNames ?? [];
    const ga4Events = context.ga4Data?.eventsList ?? [];

    let passed = leadEventNames.length > 0;
    const missingInGA4: string[] = [];
    const missingInGTM: string[] = [];

    for (const name of leadEventNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const isPresentInGA4 = ga4Events.some(e => e.toLowerCase() === trimmedName.toLowerCase());
      const isPresentInGTM = !!findGtmTagByName(context.gtmData?.tags, [trimmedName]);

      if (!isPresentInGA4) {
        missingInGA4.push(trimmedName);
      }
      if (!isPresentInGTM) {
        missingInGTM.push(trimmedName);
      }
    }

    if (missingInGA4.length > 0 || missingInGTM.length > 0 || leadEventNames.length === 0) {
      passed = false;
    }

    let description = '';
    let recommendation = '';

    if (passed) {
      description = `Lead tracking is fully active. All specified lead events (${leadEventNames.join(', ')}) are configured in GTM and receiving data in GA4.`;
      recommendation = 'Verify that lead parameters (e.g. form destination, value, source) are correctly mapped to conversion parameters.';
    } else {
      const issues: string[] = [];
      if (leadEventNames.length === 0) {
        issues.push("No lead event names were provided for audit validation");
      }
      if (missingInGTM.length > 0) {
        issues.push(`Lead event(s) not setup in GTM: ${missingInGTM.join(', ')}`);
      }
      if (missingInGA4.length > 0) {
        issues.push(`Lead event(s) not receiving data in GA4: ${missingInGA4.join(', ')}`);
      }
      description = `Lead tracking validation failed: ${issues.join('; ')}.`;
      recommendation = `Ensure that all required lead events (${leadEventNames.join(', ')}) are deployed in GTM and registered/receiving data in GA4.`;
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
