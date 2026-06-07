import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { createImplementationPlan, getConnectedContext } from '@/lib/implementation-agent/planner';
import { planRequestSchema } from '@/lib/implementation-agent/types';

export async function POST(req: NextRequest) {
  try {
    const body = planRequestSchema.parse(await req.json());
    let context: { clientId: string; command: string; recommendation?: unknown; answers?: Record<string, string> };
    let requestId = body.requestId;

    if (body.requestId) {
      const requestDoc = await adminDb.collection('implementation_requests').doc(body.requestId).get();
      if (!requestDoc.exists) {
        return NextResponse.json({ error: 'Implementation request not found.' }, { status: 404 });
      }
      const request = requestDoc.data()!;
      context = {
        clientId: request.clientId,
        command: request.command,
        recommendation: request.recommendation,
        answers: { ...(request.answers || {}), ...(body.answers || {}) }
      };
    } else {
      if (!body.clientId || !body.command) {
        return NextResponse.json({ error: 'Missing clientId or command.' }, { status: 400 });
      }
      context = {
        clientId: body.clientId,
        command: body.command,
        recommendation: body.recommendation,
        answers: body.answers
      };
      const requestRef = adminDb.collection('implementation_requests').doc();
      requestId = requestRef.id;
      await requestRef.set({
        id: requestId,
        ...context,
        status: 'ready_for_plan',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const auth = await authorizeImplementationRequest(req, context.clientId);
    if (auth.response) return auth.response;

    const connected = await getConnectedContext(context.clientId);
    const { plan, warnings, errors } = await createImplementationPlan({ ...context, ga4MeasurementId: connected.ga4MeasurementId });

    await adminDb.collection('implementation_plans').doc(plan.id).set({
      ...plan,
      requestId: requestId || null,
      accountId: connected.accountId || null,
      warnings,
      errors,
      approvedBy: null,
      approvedAt: null,
      createdBy: auth.user!.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (requestId) {
      await adminDb.collection('implementation_requests').doc(requestId).set({
        planId: plan.id,
        status: 'planned',
        updatedAt: new Date()
      }, { merge: true });
    }

    return NextResponse.json({ status: plan.status, requestId, plan, warnings, errors });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
