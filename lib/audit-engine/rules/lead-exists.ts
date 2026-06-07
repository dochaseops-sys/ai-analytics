import { AuditRule, AuditResult } from '../types';

export const leadExistsRule: AuditRule = {
  id: 'lead-exists',
  name: 'Lead Event Tracking',
  category: 'Conversion Tracking',
  severity: 'high',
  async run(context): Promise<AuditResult> {
    const leadEventNames = [
      'generate_lead', 'lead', 'sign_up', 'signup',
      'registration', 'register', 'complete_registration',
      'contact', 'contact_us'
    ];

    // Check GA4 events last 7 days
    const matchedEvent = context.ga4Data?.eventsList?.find(e => 
      leadEventNames.includes(e.toLowerCase())
    );

    // Check GA4 conversions
    const matchedConversion = context.ga4Data?.conversions?.find(c => 
      leadEventNames.includes(c.name.toLowerCase())
    );

    // Check GTM tags for GA4 lead tracking tags
    const matchedGtmTag = context.gtmData?.tags?.find(t => {
      const name = t.name.toLowerCase();
      const isGa4Event = t.type === 'gaawe';
      const isCustomHtmlGa4 = t.type === 'html' && (name.includes('ga4') || name.includes('google analytics') || name.includes('gtag'));
      
      if (!isGa4Event && !isCustomHtmlGa4) return false;

      return name.includes('lead') || 
             name.includes('sign up') || 
             name.includes('signup') || 
             name.includes('registration') || 
             name.includes('register') || 
             name.includes('contact');
    });

    const passed = !!context.ga4Data?.hasLeadEvent || !!matchedEvent || !!matchedConversion || !!matchedGtmTag;
    
    let description = '';
    let recommendation = '';

    if (passed) {
      if (matchedEvent) {
        description = `Lead generation event tracking is active (detected "${matchedEvent}" in GA4 events).`;
      } else if (matchedConversion) {
        description = `Lead generation event tracking is active (detected "${matchedConversion.name}" configured as a conversion in GA4).`;
      } else if (matchedGtmTag) {
        description = `Lead generation event tracking is active (detected GTM tag "${matchedGtmTag.name}" configured for lead capture).`;
      } else {
        description = 'Lead generation event tracking is active and receiving data.';
      }
      recommendation = 'Confirm that lead parameters (like lead source or value) are being collected.';
    } else {
      description = 'No lead generation events (such as "generate_lead", "lead", "sign_up", "registration", or "contact") have been detected in GA4.';
      recommendation = 'Set up the GA4 standard \'generate_lead\' event to fire upon successful completion of all lead capture forms or submission to lead-specific thank-you pages.';
    }

    if (!passed && context.websiteScan) {
      const detectedForms = context.websiteScan.detectedLeadForms || [];
      const keyActions = context.websiteScan.keyActions || [];
      const items = [...detectedForms, ...keyActions].filter(Boolean);
      
      if (items.length > 0) {
        const uniqueItems = Array.from(new Set(items)).slice(0, 3);
        description = `No lead generation events (such as "generate_lead", "lead", "sign_up", "registration", or "contact") have been detected in GA4. After scanning your website, we identified key actions that should be tracked: ${uniqueItems.join(', ')}.`;
        recommendation = `Set up the GA4 standard 'generate_lead' event to fire upon successful completion of these key actions: ${uniqueItems.join(', ')}. Note that sign up, registration, contact, and lead submissions are all categorized as lead events in GA4.`;
      }
    } else if (passed && context.websiteScan) {
      const detectedForms = context.websiteScan.detectedLeadForms || [];
      if (detectedForms.length > 0) {
        // Build a prefix based on what was detected
        let prefix = '';
        if (matchedEvent) {
          prefix = `Lead generation event tracking is active (detected "${matchedEvent}" in GA4 events).`;
        } else if (matchedConversion) {
          prefix = `Lead generation event tracking is active (detected "${matchedConversion.name}" configured as a conversion).`;
        } else if (matchedGtmTag) {
          prefix = `Lead generation event tracking is active (detected GTM tag "${matchedGtmTag.name}").`;
        } else {
          prefix = `Lead generation event tracking is active.`;
        }
        description = `${prefix} We verified this against your website's key actions: ${detectedForms.slice(0, 2).join(', ')}.`;
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
