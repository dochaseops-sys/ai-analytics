import { AuditRule, AuditResult } from '../types';
import { findGtmTagByName } from './rule-utils';

export const duplicateEventsRule: AuditRule = {
  id: 'duplicate-events',
  name: 'Duplicate Purchase Transaction IDs',
  category: 'Event Quality',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const purchaseEventName = context.purchaseEventName?.trim() || 'purchase';
    const ga4Events = context.ga4Data?.eventsList ?? [];

    // Re-evaluate if purchase event tracking passed
    const hasDefaultPurchase = ga4Events.some(e => e.toLowerCase() === 'purchase');
    const hasPurchaseInGTM = !!findGtmTagByName(context.gtmData?.tags, [purchaseEventName]);
    const isPurchaseNameInGA4 = ga4Events.some(e => e.toLowerCase() === purchaseEventName.toLowerCase());

    const purchasePassed = hasDefaultPurchase && hasPurchaseInGTM && isPurchaseNameInGA4;

    const duplicateCount = context.ga4Data?.duplicatePurchasesCount ?? 0;
    
    // if purchase event tracking is marked as failed, also mark duplicate checking as failed
    const passed = purchasePassed && duplicateCount === 0;

    let description = '';
    let recommendation = '';

    if (passed) {
      description = 'No duplicate purchase transaction IDs were detected. Purchase events appear to be deduplicated correctly.';
      recommendation = 'Keep validating transaction IDs in purchase events and avoid duplicate firings on browser refresh or thank-you page reloads.';
    } else {
      if (!purchasePassed) {
        description = 'Purchase event tracking has failed, so duplicate purchase transaction IDs cannot be verified.';
        recommendation = 'Resolve the issues with Purchase Event Tracking first to enable transaction deduplication verification.';
      } else {
        description = `Detected ${duplicateCount} duplicate purchase transactions. Multiple purchase events were fired with the same transaction ID.`;
        recommendation = 'Prevent duplicate purchase events by making transaction IDs unique and blocking repeat firings after conversion confirmation.';
      }
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
