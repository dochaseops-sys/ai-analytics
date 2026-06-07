import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { analyzeRequirements, buildNeedsInfoQuestions } from '@/lib/implementation-agent/requirements';
import { createImplementationPlan, getConnectedContext } from '@/lib/implementation-agent/planner';
import { implementationRequestSchema } from '@/lib/implementation-agent/types';

export async function POST(req: NextRequest) {
  try {
    const body = implementationRequestSchema.parse(await req.json());
    const auth = await authorizeImplementationRequest(req, body.clientId);
    if (auth.response) return auth.response;

    const requestRef = adminDb.collection('implementation_requests').doc();
    const connected = await getConnectedContext(body.clientId);
    const context = {
      clientId: body.clientId,
      command: body.command,
      recommendation: body.recommendation,
      answers: body.answers,
      ga4MeasurementId: connected.ga4MeasurementId
    };
    const analysis = analyzeRequirements(context);

    await requestRef.set({
      id: requestRef.id,
      clientId: body.clientId,
      command: body.command,
      recommendation: body.recommendation || null,
      answers: body.answers || {},
      inferred: analysis.inferred,
      tagIntent: analysis.tagIntent,
      missingFields: analysis.missing.map((item) => item.field),
      status: analysis.missing.length > 0 ? 'needs_info' : 'ready_for_plan',
      createdBy: auth.user!.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (analysis.missing.length > 0) {
      return NextResponse.json({
        status: 'needs_info',
        requestId: requestRef.id,
        ...buildNeedsInfoQuestions(analysis)
      });
    }

    const { plan, warnings, errors } = await createImplementationPlan(context);
    await adminDb.collection('implementation_plans').doc(plan.id).set({
      ...plan,
      requestId: requestRef.id,
      accountId: connected.accountId || null,
      warnings,
      errors,
      approvedBy: null,
      approvedAt: null,
      createdBy: auth.user!.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await requestRef.update({ status: 'planned', planId: plan.id, updatedAt: new Date() });

    return NextResponse.json({ status: plan.status, requestId: requestRef.id, plan, warnings, errors });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
