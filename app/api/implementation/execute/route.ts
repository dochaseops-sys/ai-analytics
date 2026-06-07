import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { executeImplementationPlan, saveExecutionLog } from '@/lib/implementation-agent/gtm-writer';
import { executeRequestSchema, implementationPlanSchema } from '@/lib/implementation-agent/types';
import { validateImplementationPlan } from '@/lib/implementation-agent/validators';

export async function POST(req: NextRequest) {
  try {
    const body = executeRequestSchema.parse(await req.json());
    const planRef = adminDb.collection('implementation_plans').doc(body.planId);
    const planDoc = await planRef.get();

    if (!planDoc.exists) {
      return NextResponse.json({ error: 'Implementation plan not found.' }, { status: 404 });
    }

    const rawPlan = planDoc.data()!;
    const plan = implementationPlanSchema.parse(rawPlan);
    const auth = await authorizeImplementationRequest(req, plan.clientId, { requireEditor: true });
    if (auth.response) return auth.response;

    if (plan.status !== 'approved') {
      return NextResponse.json({ error: 'Plan must be explicitly approved before execution.' }, { status: 400 });
    }

    const validation = validateImplementationPlan(plan);
    if (!validation.valid) {
      return NextResponse.json({ error: 'Plan is invalid and cannot be executed.', validation }, { status: 400 });
    }

    const accountId = rawPlan.accountId as string | undefined;
    if (!accountId) {
      return NextResponse.json({ error: 'Missing GTM account ID for this plan.' }, { status: 400 });
    }

    await planRef.update({ executionStartedAt: new Date(), updatedAt: new Date() });
    const result = await executeImplementationPlan(plan, accountId);
    const log = await saveExecutionLog(plan, result);

    await planRef.update({
      status: result.status,
      executedBy: auth.user!.uid,
      executedAt: new Date(),
      executionResult: result,
      changeLogId: log.id,
      updatedAt: new Date()
    });

    return NextResponse.json({ status: result.status, result, changeLog: log });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
