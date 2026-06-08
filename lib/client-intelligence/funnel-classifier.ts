import { BusinessModel, FunnelType, WebsiteSnapshot } from './types';

export function classifyFunnel(snapshot: WebsiteSnapshot, businessModel: BusinessModel): FunnelType {
  const text = JSON.stringify(snapshot.pages.map((page) => ({
    url: page.url,
    title: page.title,
    headings: page.headings,
    ctas: page.ctas.map((cta) => cta.label)
  }))).toLowerCase();

  if (businessModel === 'ecommerce' || /checkout|cart|buy now|payment|shipping/.test(text)) return 'purchase';
  if (businessModel === 'publisher' || /article|newsletter|subscribe|read more|author/.test(text)) return 'content_engagement';
  if (businessModel === 'saas' && /trial|demo/.test(text)) return text.includes('trial') ? 'trial' : 'subscription';
  if (/book|appointment|schedule|viewing|meeting/.test(text)) return 'booking';
  if (/lead|contact|enquiry|inquiry|quote|form|whatsapp|call/.test(text)) return 'lead';
  if (/onboarding|step|multi-step|wizard/.test(text)) return 'multi_step';
  return 'unknown';
}
