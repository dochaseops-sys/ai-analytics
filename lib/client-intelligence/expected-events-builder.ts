import { BusinessModel, DetectedCTA, ExpectedEvent } from './types';

const event = (
  eventName: string,
  priority: ExpectedEvent['priority'],
  reason: string,
  matchingEventNames: string[] = [],
  hint?: ExpectedEvent['implementationHint']
): ExpectedEvent => ({
  eventName,
  priority,
  reason,
  matchingEventNames: [eventName, ...matchingEventNames],
  matchingTagPatterns: [eventName, ...matchingEventNames],
  matchingTriggerPatterns: [eventName, ...matchingEventNames],
  implementationHint: hint
});

const clickHint = (urlPattern?: string, selectorHint?: string): ExpectedEvent['implementationHint'] => ({
  tagType: 'ga4_event',
  triggerType: 'click',
  selectorHint,
  urlPattern
});

const BASE_EVENTS: Record<BusinessModel, ExpectedEvent[]> = {
  ecommerce: [
    event('page_view', 'medium', 'Baseline page measurement is required for ecommerce attribution.'),
    event('view_item', 'high', 'Product detail views show merchandising and remarketing demand.', ['product_view']),
    event('view_item_list', 'medium', 'Product listing views show category and collection performance.'),
    event('select_item', 'medium', 'Item selections connect listing exposure to product interest.'),
    event('add_to_cart', 'high', 'Cart additions are a core ecommerce intent signal.', ['add_to_basket']),
    event('view_cart', 'medium', 'Cart views help diagnose checkout leakage.'),
    event('begin_checkout', 'critical', 'Checkout starts are essential funnel visibility.', ['checkout_start']),
    event('add_shipping_info', 'high', 'Shipping step tracking shows checkout progression.'),
    event('add_payment_info', 'high', 'Payment step tracking shows late-stage checkout progression.'),
    event('purchase', 'critical', 'Purchase tracking is the primary ecommerce revenue signal.', ['transaction', 'order_completed', 'ecommerce_purchase']),
    event('search', 'medium', 'Search reveals product demand and content gaps.')
  ],
  lead_generation: [
    event('form_start', 'medium', 'Form starts reveal friction before lead submission.', ['start_form']),
    event('form_submit', 'critical', 'Form submits are a primary lead action.', ['submit_form', 'contact_form_submit', 'enquiry_submit']),
    event('generate_lead', 'critical', 'GA4 recommended lead event supports campaign optimisation.', ['lead', 'submit_lead', 'contact_form_submit']),
    event('phone_click', 'high', 'Phone clicks are high-intent contact actions.', ['call_click']),
    event('whatsapp_click', 'high', 'WhatsApp clicks are high-intent contact actions.'),
    event('email_click', 'medium', 'Email clicks are contact intent signals.'),
    event('contact_page_view', 'medium', 'Contact page visits indicate conversion intent.'),
    event('thank_you_page_view', 'high', 'Thank-you views validate successful submissions.')
  ],
  saas: [
    event('sign_up', 'critical', 'Sign-up is a primary SaaS acquisition event.', ['signup', 'registration']),
    event('login', 'medium', 'Login helps distinguish acquisition from retention.'),
    event('trial_start', 'critical', 'Trial starts are a key SaaS activation signal.', ['start_trial']),
    event('demo_request', 'high', 'Demo requests are high-intent sales leads.', ['book_demo']),
    event('pricing_cta_click', 'high', 'Pricing CTA clicks show monetisation intent.'),
    event('subscribe', 'critical', 'Subscribe captures paid conversion.', ['subscription_start']),
    event('onboarding_step', 'medium', 'Onboarding steps reveal activation quality.'),
    event('upgrade', 'medium', 'Upgrades measure expansion.'),
    event('cancel_subscription', 'medium', 'Cancellations measure churn risk.')
  ],
  publisher: [
    event('article_view', 'high', 'Article views measure content consumption.', ['page_view']),
    event('scroll', 'high', 'Scroll depth shows engagement quality.'),
    event('newsletter_signup', 'high', 'Newsletter signups convert readers into owned audience.', ['subscribe']),
    event('outbound_click', 'medium', 'Outbound clicks measure referral and affiliate value.'),
    event('ad_impression', 'high', 'Ad impressions support revenue measurement.'),
    event('subscription_start', 'high', 'Subscriptions measure paid reader conversion.'),
    event('content_share', 'medium', 'Shares show content amplification.')
  ],
  marketplace: [
    event('search', 'high', 'Search is core marketplace intent.'),
    event('view_item', 'high', 'Listing views show demand.'),
    event('select_item', 'medium', 'Selections connect discovery to intent.'),
    event('generate_lead', 'high', 'Lead/contact events capture marketplace enquiry.'),
    event('purchase', 'critical', 'Marketplace transactions require revenue tracking.')
  ],
  real_estate: [
    event('property_view', 'high', 'Property detail views are the core consideration action.', ['view_item']),
    event('property_enquiry', 'critical', 'Property enquiries are primary conversion actions.', ['generate_lead', 'enquiry_submit']),
    event('viewing_booking', 'critical', 'Viewing bookings are high-intent sales actions.', ['appointment_booking']),
    event('phone_click', 'high', 'Phone clicks are common property lead actions.', ['call_click']),
    event('whatsapp_click', 'high', 'WhatsApp is often a primary real estate lead channel.'),
    event('brochure_download', 'medium', 'Brochure downloads show property intent.', ['file_download']),
    event('form_submit', 'critical', 'Forms capture property enquiries.', ['contact_form_submit']),
    event('generate_lead', 'critical', 'Lead events support ad optimisation.', ['lead'])
  ],
  healthcare: [
    event('appointment_booking', 'critical', 'Appointment bookings are the primary healthcare conversion.', ['booking_request']),
    event('phone_click', 'high', 'Phone clicks are high-intent patient contact actions.', ['call_click']),
    event('location_click', 'medium', 'Location clicks indicate visit intent.'),
    event('form_submit', 'high', 'Enquiry forms require privacy-safe conversion tracking.', ['contact_form_submit']),
    event('generate_lead', 'high', 'Lead events must be privacy safe in healthcare.', ['lead']),
    event('service_page_view', 'medium', 'Service page views show treatment interest.')
  ],
  education: [
    event('apply_now_click', 'critical', 'Apply now clicks are primary admissions intent.'),
    event('admission_enquiry', 'critical', 'Admissions enquiries are core lead actions.', ['generate_lead']),
    event('course_view', 'high', 'Course views show programme demand.'),
    event('brochure_download', 'medium', 'Brochure downloads indicate consideration.', ['file_download']),
    event('phone_click', 'medium', 'Phone clicks are enquiry signals.', ['call_click']),
    event('form_submit', 'high', 'Forms capture student enquiries.', ['contact_form_submit'])
  ],
  financial_services: [
    event('generate_lead', 'critical', 'Lead tracking is critical for financial service enquiries.', ['lead', 'quote_request']),
    event('quote_request', 'critical', 'Quote requests are high-intent financial conversions.'),
    event('application_start', 'high', 'Application starts show funnel entry.'),
    event('phone_click', 'high', 'Phone calls are high-intent contact actions.', ['call_click']),
    event('form_submit', 'high', 'Forms capture enquiries and applications.', ['contact_form_submit'])
  ],
  local_services: [
    event('call_click', 'critical', 'Calls are primary local service conversions.', ['phone_click']),
    event('quote_request', 'critical', 'Quote requests are high-intent conversions.', ['generate_lead']),
    event('booking_request', 'high', 'Bookings are primary service actions.', ['appointment_booking']),
    event('contact_form_submit', 'high', 'Contact forms capture service enquiries.', ['form_submit']),
    event('location_click', 'medium', 'Location clicks indicate visit intent.'),
    event('whatsapp_click', 'medium', 'WhatsApp may be a meaningful contact method.')
  ],
  nonprofit: [
    event('donate_click', 'critical', 'Donation clicks are primary nonprofit conversions.'),
    event('volunteer_signup', 'high', 'Volunteer signups are key engagement actions.'),
    event('newsletter_signup', 'medium', 'Newsletter signups build owned audience.'),
    event('form_submit', 'high', 'Forms capture supporter intent.')
  ],
  unknown: [
    event('page_view', 'medium', 'Baseline page measurement is required.'),
    event('form_submit', 'high', 'Forms are common conversion actions.'),
    event('generate_lead', 'high', 'Lead tracking is a safe default for unknown sites.')
  ]
};

export function buildExpectedEvents(businessModel: BusinessModel, ctas: DetectedCTA[] = []): ExpectedEvent[] {
  const byName = new Map<string, ExpectedEvent>();
  for (const item of BASE_EVENTS[businessModel] || BASE_EVENTS.unknown) {
    byName.set(item.eventName, item);
  }

  const add = (item: ExpectedEvent) => {
    const existing = byName.get(item.eventName);
    byName.set(item.eventName, existing && existing.priority === 'critical' ? existing : item);
  };

  for (const cta of ctas) {
    if (cta.type === 'phone') add(event('phone_click', 'high', `Phone CTA "${cta.label}" was detected on the website.`, ['call_click'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'whatsapp') add(event('whatsapp_click', 'high', `WhatsApp CTA "${cta.label}" was detected on the website.`, [], clickHint(cta.urlPattern || 'wa.me|whatsapp', cta.selectorHint)));
    if (cta.type === 'email') add(event('email_click', 'medium', `Email CTA "${cta.label}" was detected on the website.`, [], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'booking') add(event('appointment_booking', businessModel === 'healthcare' ? 'critical' : 'high', `Booking CTA "${cta.label}" was detected on the website.`, ['booking_request', 'viewing_booking'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'download') add(event('file_download', 'medium', `Download CTA "${cta.label}" was detected on the website.`, ['brochure_download'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'newsletter') add(event('newsletter_signup', 'medium', `Newsletter CTA "${cta.label}" was detected on the website.`, ['subscribe'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'signup') add(event('sign_up', businessModel === 'saas' ? 'critical' : 'high', `Signup CTA "${cta.label}" was detected on the website.`, ['signup', 'registration'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'checkout') add(event('begin_checkout', 'critical', `Checkout CTA "${cta.label}" was detected on the website.`, ['checkout_start'], clickHint(cta.urlPattern, cta.selectorHint)));
    if (cta.type === 'form') add(event('form_submit', ['lead_generation', 'real_estate'].includes(businessModel) ? 'critical' : 'high', `A form CTA was detected on ${cta.pageUrl}.`, ['contact_form_submit', 'enquiry_submit'], { tagType: 'ga4_event', triggerType: 'form_submit', selectorHint: cta.selectorHint, urlPattern: cta.pageUrl }));
  }

  return [...byName.values()];
}

export function getEventSynonyms(eventName: string) {
  return buildExpectedEvents('unknown')
    .concat(Object.values(BASE_EVENTS).flat())
    .find((item) => item.eventName === eventName)?.matchingEventNames || [eventName];
}
