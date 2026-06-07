import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { authorizeImplementationRequest } from '@/lib/implementation-agent/auth';
import { approveRequestSchema, implementationPlanSchema } from '@/lib/implementation-agent/types';
import { validateImplementationPlan } from '@/lib/implementation-agent/validators';

export async function POST(req: NextRequest) {
  try {
    const body = approveRequestSchema.parse(await req.json());
    const planRef = adminDb.collection('implementation_plans').doc(body.planId);
    const planDoc = await planRef.get();

    if (!planDoc.exists) {
      return NextResponse.json({ error: 'Implementation plan not found.' }, { status: 404 });
    }

    const plan = implementationPlanSchema.parse(planDoc.data());
    const auth = await authorizeImplementationRequest(req, plan.clientId, { requireEditor: true });
    if (auth.response) return auth.response;

    const validation = validateImplementationPlan(plan);
    if (!validation.valid || plan.status !== 'ready_for_approval') {
      return NextResponse.json({ error: 'Plan is not valid or ready for approval.', validation }, { status: 400 });
    }

    const approvedPlan = {
      ...plan,
      status: 'approved' as const,
      riskLevel: validation.riskLevel,
      warnings: validation.warnings,
      errors: validation.errors,
      approvedBy: auth.user!.uid,
      approvedAt: new Date(),
      updatedAt: new Date()
    };
    await planRef.set(approvedPlan, { merge: true });

    return NextResponse.json({ status: 'approved', plan: approvedPlan });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
