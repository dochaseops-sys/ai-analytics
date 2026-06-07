import { AuditRule, AuditResult } from '../types';

export const purchaseExistsRule: AuditRule = {
  id: 'purchase-exists',
  name: 'Purchase Event Tracking',
  category: 'Conversion Tracking',
  severity: 'critical',
  async run(context): Promise<AuditResult> {
    const purchaseEventNames = [
      'purchase', 'ecommerce_purchase', 'checkout_complete', 
      'order_completed', 'subscribe', 'transaction'
    ];

    // Check GA4 events last 7 days
    const matchedEvent = context.ga4Data?.eventsList?.find(e => 
      purchaseEventNames.includes(e.toLowerCase())
    );

    // Check GA4 conversions (excluding default 'purchase' conversion)
    const matchedConversion = context.ga4Data?.conversions?.find(c => {
      const name = c.name.toLowerCase();
      return name !== 'purchase' && purchaseEventNames.includes(name);
    });

    // Check GTM tags for GA4 purchase/transaction tracking tags
    const matchedGtmTag = context.gtmData?.tags?.find(t => {
      const name = t.name.toLowerCase();
      const isGa4Event = t.type === 'gaawe';
      const isCustomHtmlGa4 = t.type === 'html' && (name.includes('ga4') || name.includes('google analytics') || name.includes('gtag'));
      
      if (!isGa4Event && !isCustomHtmlGa4) return false;

      return name.includes('purchase') || 
             name.includes('transaction') || 
             name.includes('ecommerce') || 
             name.includes('e-commerce') ||
             name.includes('order complete') ||
             name.includes('order completion') ||
             name.includes('order placed') ||
             name.includes('placed order');
    });

    const passed = !!context.ga4Data?.hasPurchaseEvent || !!matchedEvent || !!matchedConversion || !!matchedGtmTag;

    let description = '';
    let recommendation = '';

    if (passed) {
      if (matchedEvent) {
        description = `E-commerce purchase event tracking is active (detected "${matchedEvent}" in GA4 events).`;
      } else if (matchedConversion) {
        description = `E-commerce purchase event tracking is active (detected "${matchedConversion.name}" configured as a conversion in GA4).`;
      } else if (matchedGtmTag) {
        description = `E-commerce purchase event tracking is active (detected GTM tag "${matchedGtmTag.name}" configured for e-commerce).`;
      } else {
        description = 'E-commerce purchase event tracking is active and receiving data.';
      }
      recommendation = 'Ensure that purchase events are sending accurate items, value, and currency parameters.';
    } else {
      description = 'No purchase events have been detected in GA4. E-commerce tracking is missing or broken.';
      recommendation = 'Implement the GA4 standard "purchase" event on your checkout completion pages.';
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
