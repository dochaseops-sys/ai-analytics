import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { analyzeRequirements, buildNeedsInfoQuestions } from '@/lib/implementation-agent/requirements';
import { createImplementationPlan, getConnectedContext } from '@/lib/implementation-agent/planner';
import { requirementsAnswerSchema } from '@/lib/implementation-agent/types';

export async function POST(req: NextRequest) {
  try {
    const body = requirementsAnswerSchema.parse(await req.json());
    const requestRef = adminDb.collection('implementation_requests').doc(body.requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Implementation request not found.' }, { status: 404 });
    }

    const request = requestDoc.data()!;
    const auth = await authorizeImplementationRequest(req, request.clientId);
    if (auth.response) return auth.response;

    const answers = { ...(request.answers || {}), ...body.answers };
    const connected = await getConnectedContext(request.clientId);
    const context = {
      clientId: request.clientId,
      command: request.command,
      recommendation: request.recommendation,
      answers,
      ga4MeasurementId: connected.ga4MeasurementId
    };
    const analysis = analyzeRequirements(context);

    await requestRef.update({
      answers,
      inferred: analysis.inferred,
      missingFields: analysis.missing.map((item) => item.field),
      status: analysis.missing.length > 0 ? 'needs_info' : 'ready_for_plan',
      updatedAt: new Date()
    });

    if (analysis.missing.length > 0) {
      return NextResponse.json({
        status: 'needs_info',
        requestId: body.requestId,
        ...buildNeedsInfoQuestions(analysis)
      });
    }

    const { plan, warnings, errors } = await createImplementationPlan(context);
    await adminDb.collection('implementation_plans').doc(plan.id).set({
      ...plan,
      requestId: body.requestId,
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

    return NextResponse.json({ status: plan.status, requestId: body.requestId, plan, warnings, errors });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
