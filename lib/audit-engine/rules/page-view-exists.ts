import { AuditRule, AuditResult } from '../types';
import { findGtmTagByName } from './rule-utils';

export const pageViewExistsRule: AuditRule = {
  id: 'page-view-exists',
  name: 'Page View Event Tracking',
  category: 'Event Quality',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const ga4Events = context.ga4Data?.eventsList ?? [];
    const customPageViewName = context.pageViewEventName?.trim();

    // 1. Make sure the default page view event in GA4 is receiving data from the website
    const hasDefaultPageView = ga4Events.some(e => e.toLowerCase() === 'page_view');

    let customPageViewPassed = true;
    const issues: string[] = [];

    // 2. If there is a custom page view event name provided, verify its setup in GTM and data in GA4
    if (customPageViewName && customPageViewName.toLowerCase() !== 'page_view') {
      const isCustomInGA4 = ga4Events.some(e => e.toLowerCase() === customPageViewName.toLowerCase());
      const hasCustomInGTM = !!findGtmTagByName(context.gtmData?.tags, [customPageViewName]);

      if (!isCustomInGA4 || !hasCustomInGTM) {
        customPageViewPassed = false;
        if (!hasCustomInGTM) {
          issues.push(`Custom page view event '${customPageViewName}' is not setup in GTM`);
        }
        if (!isCustomInGA4) {
          issues.push(`Custom page view event '${customPageViewName}' is not receiving data in GA4`);
        }
      }
    }

    const passed = hasDefaultPageView && customPageViewPassed;

    let description = '';
    let recommendation = '';

    if (passed) {
      description = customPageViewName && customPageViewName.toLowerCase() !== 'page_view'
        ? `Page view tracking is active. Both the default 'page_view' event and custom event '${customPageViewName}' are configured and receiving data.`
        : "Page view tracking is active. The default 'page_view' event is successfully receiving data in GA4.";
      recommendation = 'Ensure page path and title parameters are properly logged across all key landing and content pages.';
    } else {
      if (!hasDefaultPageView) {
        issues.push("Default 'page_view' event is not receiving data in GA4");
      }
      description = `Page view tracking validation failed: ${issues.join(', ')}.`;
      recommendation = customPageViewName
        ? `Ensure the default 'page_view' event fires globally, and setup the custom page view event '${customPageViewName}' in GTM and confirm it sends data to GA4.`
        : "Ensure the default 'page_view' event fires globally and is correctly configured in your GA4 property tracking code.";
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
