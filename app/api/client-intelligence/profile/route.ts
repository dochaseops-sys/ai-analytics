import { NextRequest, NextResponse } from 'next/server';
import { buildClientProfile } from '@/lib/client-intelligence/client-profile-builder';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.clientId) {
      return NextResponse.json({ error: 'Missing clientId.' }, { status: 400 });
    }

    const result = await buildClientProfile({
      clientId: body.clientId,
      websiteUrl: body.websiteUrl,
      maxPages: body.maxPages || 25,
      maxDepth: body.maxDepth || 2,
      refreshCrawl: body.refreshCrawl !== false
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
