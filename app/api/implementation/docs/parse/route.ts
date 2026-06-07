import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { parseVendorDocumentation } from '@/lib/implementation-agent/documentation-parser';
import { docsParseRequestSchema } from '@/lib/implementation-agent/types';
import { validateCustomHtml } from '@/lib/implementation-agent/validators';

export async function POST(req: NextRequest) {
  try {
    const body = docsParseRequestSchema.parse(await req.json());
    const auth = await authorizeImplementationRequest(req, body.clientId);
    if (auth.response) return auth.response;

    const parsed = await parseVendorDocumentation(body.vendorName, body.documentation);
    const htmlValidation = parsed.htmlSnippet ? validateCustomHtml(parsed.htmlSnippet) : { warnings: [], errors: [] };

    const ref = adminDb.collection('vendor_docs').doc();
    const data = {
      id: ref.id,
      clientId: body.clientId,
      vendorName: body.vendorName,
      source: body.documentation,
      parsed,
      warnings: [...parsed.warnings, ...htmlValidation.warnings],
      errors: htmlValidation.errors,
      createdBy: auth.user!.uid,
      createdAt: new Date()
    };
    await ref.set(data);

    return NextResponse.json({ parsed, vendorDocId: ref.id, warnings: data.warnings, errors: data.errors });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
