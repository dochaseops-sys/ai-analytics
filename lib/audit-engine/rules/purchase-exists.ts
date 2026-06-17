import { AuditRule, AuditResult } from '../types';
import { findGtmTagByName } from './rule-utils';

export const purchaseExistsRule: AuditRule = {
  id: 'purchase-exists',
  name: 'Purchase Event Tracking',
  category: 'Conversion Tracking',
  severity: 'critical',
  async run(context): Promise<AuditResult> {
    const purchaseEventName = context.purchaseEventName?.trim() || 'purchase';
    const ga4Events = context.ga4Data?.eventsList ?? [];

    // 1. make sure the default purchase event in GA4 is receiving data from the website
    const hasDefaultPurchase = ga4Events.some(e => e.toLowerCase() === 'purchase');

    // 2. make sure there is a purchase event setup in the GTM container with the purchase event name provided by the user
    const hasPurchaseInGTM = !!findGtmTagByName(context.gtmData?.tags, [purchaseEventName]);

    // 3. make sure the purchase event name is also present in GA4
    const isPurchaseNameInGA4 = ga4Events.some(e => e.toLowerCase() === purchaseEventName.toLowerCase());

    const passed = hasDefaultPurchase && hasPurchaseInGTM && isPurchaseNameInGA4;

    let description = '';
    let recommendation = '';

    if (passed) {
      description = `Purchase event tracking is fully active. Default 'purchase' event is receiving data in GA4, and user-specified event '${purchaseEventName}' is configured in GTM and receiving data in GA4.`;
      recommendation = 'Keep monitoring purchase event data to ensure conversion parameters (value, currency, items) are fully captured.';
    } else {
      const issues: string[] = [];
      if (!hasDefaultPurchase) {
        issues.push("Default 'purchase' event is not receiving data in GA4");
      }
      if (!hasPurchaseInGTM) {
        issues.push(`Event '${purchaseEventName}' is not set up in the GTM container`);
      }
      if (!isPurchaseNameInGA4) {
        issues.push(`Event '${purchaseEventName}' is not present or receiving data in GA4`);
      }
      description = `Purchase tracking validation failed: ${issues.join(', ')}.`;
      recommendation = `Ensure that the default 'purchase' event is fired from the site and '${purchaseEventName}' is set up as a GTM tag and registered in GA4.`;
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
