import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(_req: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await context.params;
    const snap = await adminDb.collection('personalised_audit_runs')
      .where('clientId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return NextResponse.json({ auditRun: null });
    return NextResponse.json({ auditRun: snap.docs[0].data() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
