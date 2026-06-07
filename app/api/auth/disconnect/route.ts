import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId parameter' }, { status: 400 });
    }

    // 1. Delete google_credentials document
    await adminDb.collection('google_credentials').doc(clientId).delete();

    // 2. Delete ga4_properties connection
    await adminDb.collection('ga4_properties').doc(clientId).delete();

    // 3. Delete gtm_containers connection
    await adminDb.collection('gtm_containers').doc(clientId).delete();

    // 4. Set googleConnected to false in client profile
    await adminDb.collection('clients').doc(clientId).set(
      { googleConnected: false },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Google integration:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
