import { generateContentWithRetry } from './gemini';

export interface WebsiteScanResult {
  businessType: string;
  keyActions: string[];
  detectedLeadForms: string[];
}

/**
 * Scans the home page of a website, extracts its structure, and uses Gemini to
 * identify the business type and key actions that should be tracked.
 */
export async function scanWebsite(url: string): Promise<WebsiteScanResult | undefined> {
  const originalReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    console.log(`[Scanner] Starting website scan for: ${url}`);
    
    // Add protocol if missing
    let targetUrl = url;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    let response: Response;
    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      response = await fetch(targetUrl, { signal: controller.signal });
    } finally {
      if (originalReject === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalReject;
      }
    }
    clearTimeout(id);

    if (!response.ok) {
      console.warn(`[Scanner] Fetch failed for ${targetUrl} with status: ${response.status}`);
      return undefined;
    }

    const html = await response.text();

    // 1. Extract Page Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // 2. Extract form structures (first 5 forms, capped at 300 characters each)
    const forms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi)]
      .map(f => f[0])
      .filter(Boolean)
      .slice(0, 5)
      .map(f => f.slice(0, 300));

    // 3. Extract buttons text
    const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)]
      .map(b => b[0].replace(/<[^>]*>/g, '').trim())
      .filter(b => b.length > 1 && b.length < 50)
      .slice(0, 10);

    // 4. Extract inputs types/names
    const inputs = [...html.matchAll(/<input[^>]*>/gi)]
      .map(i => i[0].slice(0, 150))
      .slice(0, 15);

    // 5. Extract links (focus on conversion indicators)
    const links = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(a => ({
        href: a[1],
        text: a[2].replace(/<[^>]*>/g, '').trim()
      }))
      .filter(l => 
        l.text.length > 1 &&
        (/contact|sign|register|join|apply|pricing|checkout|book|demo|quote|support|login/i.test(l.href) ||
         /contact|sign|register|join|apply|pricing|checkout|book|demo|quote|support|login/i.test(l.text))
      )
      .slice(0, 10);

    const summaryText = `
      URL: ${targetUrl}
      Title: ${title}
      Forms count: ${forms.length}
      Form details: ${JSON.stringify(forms)}
      Input tags: ${JSON.stringify(inputs)}
      Buttons text: ${JSON.stringify(buttons)}
      Conversion links: ${JSON.stringify(links)}
    `;

    const prompt = `
      Analyze this website structure data to:
      1. Determine the business model/industry type (e.g. Lead Generation, E-commerce, SaaS, Local Business, Agency, Informational).
      2. Identify the key user conversion actions that should be tracked (e.g. contact form submission, account sign up, newsletter registration, product purchase).
      3. Identify any specific lead forms, contacts, or signups present in the data.

      Website Data Summary:
      ${summaryText}

      Please return a JSON object matching this schema:
      {
        "businessType": "String representing business model",
        "keyActions": ["Short description of a conversion action to track"],
        "detectedLeadForms": ["Short description of specific form or contact link found"]
      }

      Do not include any other text besides the JSON object.
    `;

    const geminiRes = await generateContentWithRetry(prompt, {
      responseMimeType: 'application/json'
    });

    const parsed = JSON.parse(geminiRes) as WebsiteScanResult;
    console.log(`[Scanner] Successfully completed scan for ${targetUrl}:`, parsed);
    return parsed;

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.warn(`[Scanner] Website scan timed out after 15 seconds for: ${url}`);
    } else {
      console.error(`[Scanner] Failed to scan website ${url}:`, err);
    }
    return undefined;
  }
}
