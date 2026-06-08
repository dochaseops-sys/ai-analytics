import { AuditRule, AuditResult } from '../types';
import { findMatchingName, findMatchingConversion, findGtmTagByName } from './rule-utils';

const purchaseEventPatterns = [
  'purchase', 'ecommerce_purchase', 'checkout_complete',
  'order_completed', 'subscribe', 'transaction', 'order placed', 'order completion'
];

export const purchaseExistsRule: AuditRule = {
  id: 'purchase-exists',
  name: 'Purchase Event Tracking',
  category: 'Conversion Tracking',
  severity: 'critical',
  async run(context): Promise<AuditResult> {
    const eventNames = context.ga4Data?.eventsList ?? [];
    const matchedEvent = findMatchingName(eventNames, purchaseEventPatterns);
    const matchedConversion = findMatchingConversion(context.ga4Data?.conversions, purchaseEventPatterns);
    const matchedGtmTag = findGtmTagByName(context.gtmData?.tags, purchaseEventPatterns);
    const hasPurchaseEvent = !!context.ga4Data?.hasPurchaseEvent || !!matchedEvent || !!matchedConversion || !!matchedGtmTag;

    let description = '';
    let recommendation = 'Ensure that purchase events are sending accurate items, value, and currency parameters.';

    if (hasPurchaseEvent) {
      if (matchedEvent) {
        description = `Purchase event tracking is active (detected "${matchedEvent}" in GA4 events).`;
      } else if (matchedConversion) {
        description = `Purchase tracking is active (detected conversion "${matchedConversion.name}" in GA4).`;
      } else if (matchedGtmTag) {
        description = `Purchase tracking appears configured in GTM (tag "${matchedGtmTag.name}"). Verify that this tag is firing and sending data to GA4.`;
      } else {
        description = 'Purchase event tracking is active and receiving data.';
      }
    } else {
      description = 'No purchase events have been detected in GA4. E-commerce tracking is missing or broken.';
      recommendation = 'Implement the GA4 standard "purchase" event on your checkout completion or order confirmation pages.';
    }

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description,
      recommendation,
      category: this.category,
      passed: hasPurchaseEvent
    };
  }
};
