import { AuditRule, AuditResult } from '../types';

export const duplicateEventsRule: AuditRule = {
  id: 'duplicate-events',
  name: 'Duplicate Purchase Events',
  category: 'Event Quality',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const duplicateCount = context.ga4Data?.duplicatePurchasesCount ?? 0;
    const passed = duplicateCount === 0;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? 'No duplicate purchase transactions detected. Transaction IDs are unique.'
        : `Detected ${duplicateCount} duplicate purchase transactions. Multiple purchase events were fired with the exact same transaction ID.`,
      recommendation: passed
        ? 'Continue monitoring. Ensure transaction ID field is always populated and unique.'
        : 'Implement transaction ID deduplication in your web layer or GTM container. Prevent tags from firing again on page refresh.',
      category: this.category,
      passed
    };
  }
};
