import { generateContentWithRetry } from '@/lib/gemini';

export type ParsedVendorDocumentation = {
  vendorName: string;
  summary: string;
  requiredFields: string[];
  recommendedTrigger: string;
  htmlSnippet?: string;
  warnings: string[];
};

export async function parseVendorDocumentation(vendorName: string, documentation: string): Promise<ParsedVendorDocumentation> {
  const prompt = `Return JSON only. Parse this vendor tracking documentation into implementation requirements.

Vendor: ${vendorName}
Documentation:
${documentation.slice(0, 12000)}

Schema:
{
  "vendorName": "string",
  "summary": "string",
  "requiredFields": ["string"],
  "recommendedTrigger": "string",
  "htmlSnippet": "string optional",
  "warnings": ["string"]
}`;

  const text = await generateContentWithRetry(prompt, {
    responseMimeType: 'application/json',
    temperature: 0.1
  });
  const parsed = JSON.parse(text);

  return {
    vendorName,
    summary: String(parsed.summary || ''),
    requiredFields: Array.isArray(parsed.requiredFields) ? parsed.requiredFields.map(String) : [],
    recommendedTrigger: String(parsed.recommendedTrigger || 'all_pages'),
    htmlSnippet: typeof parsed.htmlSnippet === 'string' ? parsed.htmlSnippet : undefined,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
  };
}
