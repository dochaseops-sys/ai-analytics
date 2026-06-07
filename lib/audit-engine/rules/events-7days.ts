import { AuditRule, AuditResult } from '../types';

export const events7DaysRule: AuditRule = {
  id: 'events-7days',
  name: 'Active Events (Last 7 Days)',
  category: 'Event Quality',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const events = context.ga4Data?.eventsLast7Days ?? [];
    const totalEvents = events.reduce((sum, e) => sum + e.count, 0);
    const passed = totalEvents > 0;
    return {
      issueId: this.id,
      severity: this.severity,
      title: this.name,
      description: passed
        ? `Successfully verified GA4 activity. Captured ${totalEvents} events across ${events.length} event types in the last 7 days.`
        : 'No events have been received by GA4 in the last 7 days. Tracking may be completely offline.',
      recommendation: passed
        ? 'Periodically audit your top events (page_view, session_start) to ensure volume matches expected traffic.'
        : 'Verify that the GA4 tracking script is running on the website and that the measurement ID is correct.',
      category: this.category,
      passed
    };
  }
};
