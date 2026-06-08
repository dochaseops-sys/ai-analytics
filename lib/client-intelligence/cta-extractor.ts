import { CTAType, DetectedCTA, WebsitePageSnapshot } from './types';

const stripTags = (value: string) => value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

export function classifyCTA(label: string, href = ''): CTAType {
  const text = `${label} ${href}`.toLowerCase();
  if (href.startsWith('tel:') || /call|phone|telephone/.test(text)) return 'phone';
  if (href.startsWith('mailto:') || /email|mail/.test(text)) return 'email';
  if (/wa\.me|whatsapp|api\.whatsapp/.test(text)) return 'whatsapp';
  if (/calendly|acuity|book|appointment|schedule|meeting|viewing/.test(text)) return 'booking';
  if (/checkout|cart|buy now|pay|order/.test(text)) return 'checkout';
  if (/download|brochure|pdf|file/.test(text)) return 'download';
  if (/sign up|signup|register|trial|start free/.test(text)) return 'signup';
  if (/log in|login|sign in|signin/.test(text)) return 'login';
  if (/newsletter|subscribe/.test(text)) return 'newsletter';
  if (/chat|intercom|drift|livechat/.test(text)) return 'chat';
  if (/form|submit|enquire|inquire|contact|quote|demo|lead/.test(text)) return 'form';
  if (/^https?:\/\//.test(href)) return 'outbound';
  return 'unknown';
}

export function extractPageCtas(html: string, pageUrl: string): WebsitePageSnapshot['ctas'] {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => {
    const href = decode(match[1] || '');
    const label = decode(stripTags(match[2] || '') || href).slice(0, 100);
    return {
      label,
      href,
      selectorHint: href ? `a[href*="${href.slice(0, 50).replace(/"/g, '')}"]` : undefined,
      type: classifyCTA(label, href)
    };
  });

  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map((match) => {
    const attrs = match[1] || '';
    const label = decode(stripTags(match[2] || '')).slice(0, 100);
    const selectorHint = attrs.match(/id=["']([^"']+)["']/i)?.[1]
      ? `#${attrs.match(/id=["']([^"']+)["']/i)?.[1]}`
      : attrs.match(/class=["']([^"']+)["']/i)?.[1]
        ? `button.${(attrs.match(/class=["']([^"']+)["']/i)?.[1] || '').split(/\s+/)[0]}`
        : 'button';
    return {
      label: label || 'Button',
      selectorHint,
      type: classifyCTA(label)
    };
  });

  const formCtas = [...html.matchAll(/<form\b([^>]*)>/gi)].map((match, index) => {
    const attrs = match[1] || '';
    const action = attrs.match(/action=["']([^"']+)["']/i)?.[1];
    return {
      label: `Form ${index + 1}`,
      href: action,
      selectorHint: attrs.match(/id=["']([^"']+)["']/i)?.[1] ? `#${attrs.match(/id=["']([^"']+)["']/i)?.[1]}` : 'form',
      type: 'form'
    };
  });

  return [...anchors, ...buttons, ...formCtas]
    .filter((cta) => cta.label.length > 0)
    .slice(0, 80);
}

export function normalizeDetectedCTAs(pages: WebsitePageSnapshot[]): DetectedCTA[] {
  const seen = new Set<string>();
  const result: DetectedCTA[] = [];

  for (const page of pages) {
    for (const cta of page.ctas) {
      const type = classifyCTA(cta.label, cta.href);
      if (type === 'unknown') continue;
      const key = `${type}:${cta.label.toLowerCase()}:${cta.href || ''}:${page.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        label: cta.label,
        type,
        selectorHint: cta.selectorHint,
        urlPattern: cta.href,
        pageUrl: page.url
      });
    }
  }

  return result.slice(0, 120);
}
