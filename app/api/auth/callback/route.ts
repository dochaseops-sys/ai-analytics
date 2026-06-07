import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google-auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const clientId = searchParams.get('state');

  if (!code || !clientId) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  try {
    const origin = new URL(req.url).origin;
    await exchangeCodeForTokens(code, clientId, origin);
    
    return NextResponse.redirect(`${origin}/clients/${clientId}?googleConnected=true`);
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
