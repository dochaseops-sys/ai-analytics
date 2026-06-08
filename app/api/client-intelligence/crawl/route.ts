import { NextRequest, NextResponse } from 'next/server';
import { crawlWebsite } from '@/lib/client-intelligence/website-crawler';
import { saveWebsiteSnapshot } from '@/lib/client-intelligence/client-profile-builder';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.clientId || !body.websiteUrl) {
      return NextResponse.json({ error: 'Missing clientId or websiteUrl.' }, { status: 400 });
    }

    const snapshot = await saveWebsiteSnapshot(await crawlWebsite({
      clientId: body.clientId,
      websiteUrl: body.websiteUrl,
      maxPages: body.maxPages || 25,
      maxDepth: body.maxDepth || 2
    }));

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
