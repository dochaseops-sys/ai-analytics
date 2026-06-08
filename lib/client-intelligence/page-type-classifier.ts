import { DetectedIntent, PageType } from './types';

const has = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

export function classifyPageType(url: string, title = '', headings: string[] = []): PageType {
  const text = `${url} ${title} ${headings.join(' ')}`.toLowerCase();
  const path = new URL(url).pathname.toLowerCase();

  if (path === '/' || path === '') return 'home';
  if (has(text, ['thank-you', 'thank_you', 'thanks', 'confirmation'])) return 'thank_you';
  if (has(text, ['checkout', 'cart', 'payment', 'shipping'])) return 'checkout';
  if (has(text, ['pricing', 'plans'])) return 'pricing';
  if (has(text, ['contact', 'enquiry', 'inquiry'])) return 'contact';
  if (has(text, ['book', 'appointment', 'schedule', 'calendly', 'acuity'])) return 'booking';
  if (has(text, ['login', 'sign-in', 'signin'])) return 'login';
  if (has(text, ['signup', 'sign-up', 'register', 'trial'])) return 'signup';
  if (has(text, ['blog', 'news', 'insights'])) return 'blog';
  if (has(path, ['/article/', '/post/', '/news/'])) return 'article';
  if (has(text, ['product', 'shop', 'property', 'listing'])) return 'product';
  if (has(text, ['service', 'solution', 'treatment', 'course'])) return 'service';
  if (has(text, ['landing', 'lp-', 'campaign', 'utm_'])) return 'landing_page';

  return 'unknown';
}

export function classifyPageIntent(pageType: PageType): DetectedIntent {
  if (['checkout', 'contact', 'booking', 'thank_you', 'signup'].includes(pageType)) return 'conversion';
  if (['pricing', 'product', 'service', 'landing_page'].includes(pageType)) return 'consideration';
  if (['login'].includes(pageType)) return 'retention';
  if (['blog', 'article', 'home'].includes(pageType)) return 'awareness';
  return 'unknown';
}
