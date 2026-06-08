import { extractPageCtas } from './cta-extractor';
import { classifyPageType } from './page-type-classifier';
import { WebsitePageSnapshot, WebsiteSnapshot } from './types';

type CrawlOptions = {
  clientId: string;
  websiteUrl: string;
  maxPages?: number;
  maxDepth?: number;
};

const REQUEST_TIMEOUT_MS = 10000;

const cleanText = (value: string) => value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const unique = <T>(items: T[]) => [...new Set(items)].filter(Boolean);

function normalizeUrl(url: string, base?: string) {
  try {
    const parsed = new URL(url, base);
    parsed.hash = '';
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'TrackingHealthAI/1.0 (+https://tracking-health-ai.local)'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function allowedByRobots(origin: string, targetUrl: string) {
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`);
    if (!res.ok) return true;
    const robots = await res.text();
    const path = new URL(targetUrl).pathname;
    const disallowed = robots
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.replace(/^disallow:\s*/i, '').trim())
      .filter(Boolean);
    return !disallowed.some((rule) => rule !== '/' && path.startsWith(rule));
  } catch {
    return true;
  }
}

function extractLinks(html: string, pageUrl: string, origin: string) {
  return unique([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeUrl(match[1], pageUrl))
    .filter((href): href is string => Boolean(href))
    .filter((href) => {
      const parsed = new URL(href);
      return parsed.origin === origin && !/\.(pdf|jpg|jpeg|png|gif|webp|zip|docx?|xlsx?)$/i.test(parsed.pathname);
    }));
}

function extractHeadings(html: string) {
  return unique([...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((match) => cleanText(match[1] || ''))
    .filter((value) => value.length > 0 && value.length < 160))
    .slice(0, 30);
}

function extractMeta(html: string, name: string) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(pattern)?.[1]?.trim();
}

function extractTitle(html: string) {
  return cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 180);
}

async function crawlPage(url: string, origin: string): Promise<WebsitePageSnapshot | undefined> {
  const res = await fetchWithTimeout(url);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('text/html')) return undefined;
  const html = (await res.text()).slice(0, 900000);
  const title = extractTitle(html);
  const metaDescription = extractMeta(html, 'description');
  const headings = extractHeadings(html);
  const ctas = extractPageCtas(html, url);
  const internalLinks = extractLinks(html, url, origin);
  const phoneLinks = unique(ctas.map((cta) => cta.href || '').filter((href) => href.startsWith('tel:')));
  const emailLinks = unique(ctas.map((cta) => cta.href || '').filter((href) => href.startsWith('mailto:')));
  const whatsappLinks = unique(ctas.map((cta) => cta.href || '').filter((href) => /wa\.me|whatsapp/i.test(href)));
  const pageType = classifyPageType(url, title, headings);

  return {
    url,
    title,
    metaDescription,
    headings,
    ctas,
    formsDetected: (html.match(/<form\b/gi) || []).length,
    phoneLinks,
    emailLinks,
    whatsappLinks,
    internalLinks,
    pageType
  };
}

export async function crawlWebsite({ clientId, websiteUrl, maxPages = 25, maxDepth = 2 }: CrawlOptions): Promise<WebsiteSnapshot> {
  const startUrl = normalizeUrl(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
  if (!startUrl) throw new Error('Invalid website URL.');

  const origin = new URL(startUrl).origin;
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const seen = new Set<string>();
  const pages: WebsitePageSnapshot[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const next = queue.shift()!;
    if (seen.has(next.url) || next.depth > maxDepth) continue;
    seen.add(next.url);
    if (!(await allowedByRobots(origin, next.url))) continue;

    try {
      const page = await crawlPage(next.url, origin);
      if (!page) continue;
      pages.push(page);

      const prioritizedLinks = page.internalLinks.sort((a, b) => {
        const score = (url: string) => /pricing|contact|checkout|cart|book|demo|service|product|property|blog|course|appointment/i.test(url) ? -1 : 1;
        return score(a) - score(b);
      });

      for (const link of prioritizedLinks) {
        if (pages.length + queue.length >= maxPages * 3) break;
        if (!seen.has(link)) queue.push({ url: link, depth: next.depth + 1 });
      }
    } catch (error) {
      console.warn(`[Crawler] Failed to crawl ${next.url}`, error);
    }
  }

  return {
    id: '',
    clientId,
    websiteUrl: startUrl,
    pages,
    createdAt: new Date()
  };
}
