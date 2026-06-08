import { NextResponse } from 'next/server';
import { getClientProfile } from '@/lib/client-intelligence/client-profile-builder';

export async function GET(_req: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const profile = await getClientProfile(clientId);
    if (!profile) return NextResponse.json({ error: 'Client profile not found.' }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
