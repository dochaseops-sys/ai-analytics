import { adminDb } from '../lib/firebase-admin';
import { getConnectedContext, createImplementationPlan } from '../lib/implementation-agent/planner';
import { analyzeRequirements } from '../lib/implementation-agent/requirements';

async function run() {
  const requestId = 'nfU75ON0sUJxj4C3Wr5R';
  const requestDoc = await adminDb.collection('implementation_requests').doc(requestId).get();
  if (!requestDoc.exists) {
    console.error('Request not found');
    return;
  }

  const request = requestDoc.data()!;
  console.log('Original Request:', JSON.stringify(request, null, 2));

  const answers = {
    ...request.answers,
    measurementId: 'G-MMSSM8M499',
    eventName: 'PageViews',
    trigger: 'all_pages'
  };

  const connected = await getConnectedContext(request.clientId);
  const context = {
    clientId: request.clientId,
    command: request.command,
    recommendation: request.recommendation,
    answers,
    ga4MeasurementId: connected.ga4MeasurementId
  };

  try {
    console.log('\n--- Running analyzeRequirements ---');
    const analysis = analyzeRequirements(context);
    console.log('Analysis inferred:', analysis.inferred);
    console.log('Missing fields:', analysis.missing.map(m => m.field));

    console.log('\n--- Running createImplementationPlan ---');
    const { plan, warnings, errors } = await createImplementationPlan(context);
    console.log('Generated plan summary:', plan.summary);
    console.log('Generated plan actions:', JSON.stringify(plan.actions, null, 2));
  } catch (err) {
    console.error('CRASHED WITH ERROR:');
    console.error(err);
  }
}

run().catch(console.error);
