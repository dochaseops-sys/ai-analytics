import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export type AuthorizedImplementationUser = {
  uid: string;
  role: 'owner' | 'admin' | 'viewer';
};

export async function authorizeImplementationRequest(
  req: NextRequest,
  clientId: string,
  options: { requireEditor?: boolean } = {}
): Promise<{ user?: AuthorizedImplementationUser; response?: NextResponse }> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { response: NextResponse.json({ error: 'Missing Firebase ID token.' }, { status: 401 }) };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const clientDoc = await adminDb.collection('clients').doc(clientId).get();

    if (!clientDoc.exists) {
      return { response: NextResponse.json({ error: 'Client not found.' }, { status: 404 }) };
    }

    const client = clientDoc.data()!;
    const memberRole = client.members?.[decoded.uid] as 'owner' | 'admin' | 'viewer' | undefined;
    const role = memberRole || (client.createdBy === decoded.uid || client.createdBy === decoded.email ? 'owner' : undefined);

    if (!role) {
      return { response: NextResponse.json({ error: 'You do not have access to this client.' }, { status: 403 }) };
    }

    if (options.requireEditor && !['owner', 'admin'].includes(role)) {
      return { response: NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 }) };
    }

    return { user: { uid: decoded.uid, role } };
  } catch (error) {
    return { response: NextResponse.json({ error: (error as Error).message }, { status: 401 }) };
  }
}
