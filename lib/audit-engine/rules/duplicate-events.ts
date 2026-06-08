import { AuditRule, AuditResult } from '../types';
import { matchesAnyName } from './rule-utils';

const purchaseEventPatterns = [
  'purchase', 'ecommerce_purchase', 'checkout_complete', 'order_completed', 'subscribe', 'transaction'
];

export const duplicateEventsRule: AuditRule = {
  id: 'duplicate-events',
  name: 'Duplicate Purchase Transaction IDs',
  category: 'Event Quality',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const duplicateCount = context.ga4Data?.duplicatePurchasesCount ?? 0;
    const hasPurchaseEvents = context.ga4Data?.eventsList?.some((eventName) => matchesAnyName(eventName, purchaseEventPatterns));
    const passed = duplicateCount === 0;
    const description = hasPurchaseEvents
      ? passed
        ? 'No duplicate purchase transaction IDs were detected. Purchase events appear to be deduplicated correctly.'
        : `Detected ${duplicateCount} duplicate purchase transactions. Multiple purchase events were fired with the same transaction ID.`
      : passed
        ? 'No duplicate purchase transaction IDs were detected, but purchase tracking has not been confirmed in GA4.'
        : `Detected ${duplicateCount} duplicate purchase transactions, but purchase tracking is also missing from recent GA4 event data.`;

    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description,
      recommendation: passed
        ? 'Keep validating transaction IDs in purchase events and avoid duplicate firings on browser refresh or thank-you page reloads.'
        : 'Prevent duplicate purchase events by making transaction IDs unique and blocking repeat firings after conversion confirmation.',
      category: this.category,
      passed
    };
  }
};
