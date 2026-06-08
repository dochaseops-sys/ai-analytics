import { generateContentWithRetry } from '@/lib/gemini';
import { BusinessModel, FunnelType, GeminiProfile, WebsiteSnapshot, businessModelSchema, funnelTypeSchema, geminiProfileSchema } from './types';

type Classification = {
  industry: string;
  businessModel: BusinessModel;
  funnelType: FunnelType;
  primaryConversionGoals: string[];
  secondaryConversionGoals: string[];
  confidence: number;
  reasoningSummary: string;
};

const scoreTerms = (text: string, terms: string[]) => terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);

export function classifyIndustryDeterministically(snapshot: WebsiteSnapshot): Classification {
  const text = JSON.stringify(snapshot.pages.map((page) => ({
    url: page.url,
    title: page.title,
    meta: page.metaDescription,
    headings: page.headings,
    ctas: page.ctas.map((cta) => `${cta.label} ${cta.href || ''}`)
  }))).toLowerCase();

  const candidates: Array<{ industry: string; businessModel: BusinessModel; goals: string[]; secondary: string[]; score: number }> = [
    { industry: 'ecommerce', businessModel: 'ecommerce', goals: ['purchase', 'add_to_cart', 'begin_checkout'], secondary: ['view_item', 'search'], score: scoreTerms(text, ['shop', 'cart', 'checkout', 'add to cart', 'shipping', 'product', 'sku', 'order']) },
    { industry: 'saas', businessModel: 'saas', goals: ['sign_up', 'trial_start', 'demo_request'], secondary: ['login', 'pricing_cta_click', 'subscribe'], score: scoreTerms(text, ['saas', 'software', 'pricing', 'demo', 'trial', 'login', 'subscribe', 'platform']) },
    { industry: 'publisher', businessModel: 'publisher', goals: ['article_view', 'scroll', 'newsletter_signup'], secondary: ['outbound_click', 'content_share'], score: scoreTerms(text, ['article', 'blog', 'news', 'author', 'newsletter', 'read more', 'category']) },
    { industry: 'real_estate', businessModel: 'real_estate', goals: ['property_enquiry', 'phone_click', 'whatsapp_click', 'viewing_booking'], secondary: ['brochure_download', 'property_view'], score: scoreTerms(text, ['property', 'listing', 'apartment', 'real estate', 'realtor', 'viewing', 'bedroom', 'for sale', 'for rent']) },
    { industry: 'healthcare', businessModel: 'healthcare', goals: ['appointment_booking', 'phone_click', 'form_submit'], secondary: ['location_click', 'service_page_view'], score: scoreTerms(text, ['clinic', 'doctor', 'patient', 'appointment', 'healthcare', 'medical', 'treatment', 'hospital', 'dentist']) },
    { industry: 'education', businessModel: 'education', goals: ['apply_now_click', 'admission_enquiry', 'course_view'], secondary: ['brochure_download', 'phone_click'], score: scoreTerms(text, ['course', 'admission', 'student', 'school', 'university', 'programme', 'program', 'apply now']) },
    { industry: 'financial_services', businessModel: 'financial_services', goals: ['lead_submit', 'quote_request', 'phone_click'], secondary: ['application_start', 'document_download'], score: scoreTerms(text, ['finance', 'loan', 'insurance', 'mortgage', 'investment', 'banking', 'quote']) },
    { industry: 'local_services', businessModel: 'local_services', goals: ['quote_request', 'booking_request', 'call_click'], secondary: ['location_click', 'contact_form_submit'], score: scoreTerms(text, ['service area', 'call now', 'quote', 'local', 'repair', 'installation', 'near me']) }
  ];

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 2) {
    return {
      industry: 'unknown',
      businessModel: 'lead_generation',
      funnelType: 'lead',
      primaryConversionGoals: ['form_submit', 'generate_lead'],
      secondaryConversionGoals: ['phone_click', 'email_click'],
      confidence: 0.35,
      reasoningSummary: 'Limited website signals were available; lead generation is the safest default because forms/contact CTAs are common.'
    };
  }

  const funnelType: FunnelType =
    best.businessModel === 'ecommerce' ? 'purchase' :
    best.businessModel === 'publisher' ? 'content_engagement' :
    best.businessModel === 'saas' ? 'trial' :
    ['healthcare', 'local_services'].includes(best.businessModel) ? 'booking' :
    'lead';

  return {
    industry: best.industry,
    businessModel: best.businessModel,
    funnelType,
    primaryConversionGoals: best.goals,
    secondaryConversionGoals: best.secondary,
    confidence: Math.min(0.92, 0.45 + best.score * 0.08),
    reasoningSummary: `Deterministic classification matched ${best.score} website signals for ${best.industry}.`
  };
}

function cleanJson(text: string) {
  return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
}

export async function refineClassificationWithGemini(snapshot: WebsiteSnapshot, deterministic: Classification): Promise<GeminiProfile | undefined> {
  const evidence = snapshot.pages.slice(0, 15).map((page) => ({
    url: page.url,
    title: page.title,
    headings: page.headings.slice(0, 8),
    ctas: page.ctas.slice(0, 20).map((cta) => ({ label: cta.label, href: cta.href, type: cta.type })),
    formsDetected: page.formsDetected,
    pageType: page.pageType
  }));

  const prompt = `Return JSON only. Classify this website using only the structured evidence.
Allowed businessModel values: ${businessModelSchema.options.join(', ')}
Allowed funnelType values: ${funnelTypeSchema.options.join(', ')}
Schema:
{"industry":"string","businessModel":"one allowed value","funnelType":"one allowed value","primaryConversionGoals":["string"],"secondaryConversionGoals":["string"],"importantPages":[],"detectedCTAs":[],"confidence":0.0,"reasoningSummary":"string"}

Deterministic baseline:
${JSON.stringify(deterministic)}

Website evidence:
${JSON.stringify(evidence, null, 2)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await generateContentWithRetry(prompt, {
        responseMimeType: 'application/json',
        temperature: attempt === 0 ? 0.1 : 0
      });
      return geminiProfileSchema.parse(JSON.parse(cleanJson(text)));
    } catch (error) {
      console.warn(`[Client Intelligence] Gemini classification attempt ${attempt + 1} failed`, error);
    }
  }

  return undefined;
}
