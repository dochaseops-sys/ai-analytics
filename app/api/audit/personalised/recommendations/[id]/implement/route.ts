import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const recommendationDoc = await adminDb.collection('personalised_recommendations').doc(id).get();
    if (!recommendationDoc.exists) {
      return NextResponse.json({ error: 'Recommendation not found.' }, { status: 404 });
    }

    const recommendation = recommendationDoc.data()!;
    const command = [
      `Implement personalised audit fix: ${recommendation.title}.`,
      recommendation.recommendedFix,
      recommendation.implementationContext?.eventName ? `Event name: ${recommendation.implementationContext.eventName}.` : '',
      recommendation.implementationContext?.triggerType ? `Trigger type: ${recommendation.implementationContext.triggerType}.` : '',
      recommendation.implementationContext?.urlPattern ? `URL pattern: ${recommendation.implementationContext.urlPattern}.` : '',
      recommendation.implementationContext?.selectorHint ? `Selector hint: ${recommendation.implementationContext.selectorHint}.` : ''
    ].filter(Boolean).join(' ');

    const requestRef = adminDb.collection('implementation_requests').doc();
    await requestRef.set({
      id: requestRef.id,
      clientId: recommendation.clientId,
      command,
      recommendation,
      status: 'needs_plan',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({ success: true, requestId: requestRef.id, command, recommendation });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
