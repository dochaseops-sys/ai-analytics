import { AuditRule, AuditResult } from '../types';

export const formSubmitExistsRule: AuditRule = {
  id: 'form-submit-exists',
  name: 'Form Submit Event Tracking',
  category: 'Event Quality',
  severity: 'medium',
  async run(context): Promise<AuditResult> {
    const leadEventNames = [
      'generate_lead', 'lead', 'sign_up', 'signup',
      'registration', 'register', 'complete_registration',
      'contact', 'contact_us'
    ];

    const hasGa4LeadEvent = context.ga4Data?.eventsList?.some(e => 
      leadEventNames.includes(e.toLowerCase())
    ) || false;

    const hasGa4LeadConversion = context.ga4Data?.conversions?.some(c => 
      leadEventNames.includes(c.name.toLowerCase())
    ) || false;

    const hasGtmLeadTag = context.gtmData?.tags?.some(t => {
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
    }) || false;

    const hasLead = !!context.ga4Data?.hasLeadEvent || hasGa4LeadEvent || hasGa4LeadConversion || hasGtmLeadTag;

    const hasFormSubmit = !!context.ga4Data?.hasFormSubmitEvent || 
                          context.ga4Data?.eventsList?.some(e => ['form_submit', 'submit_form'].includes(e.toLowerCase())) ||
                          context.gtmData?.triggers?.some(t => {
                            const type = t.type;
                            const name = t.name.toLowerCase();
                            return type === 'formSubmission' || name.includes('form submit') || name.includes('form submission');
                          }) ||
                          false;
    
    const passed = hasFormSubmit || hasLead;
    
    let description = '';
    let recommendation = '';
    
    if (passed) {
      if (hasFormSubmit) {
        description = 'Form submission tracking is working and receiving events.';
        recommendation = 'Ensure that form ID or form name parameters are being logged to distinguish between forms.';
      } else {
        description = 'Form submission tracking is satisfied since a lead generation conversion event is already active.';
        recommendation = 'No action required. Form interactions are already tracked and captured via your active lead conversion events.';
      }
    } else {
      description = 'No form submission events (e.g., "form_submit", "submit_form") were detected in your GA4 property.';
      recommendation = 'Enable GA4 Enhanced Measurement for Form Interactions, or configure a custom GTM form trigger.';
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
