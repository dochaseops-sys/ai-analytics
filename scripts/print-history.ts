import { adminDb } from '../lib/firebase-admin';

async function run() {
  const auditRunsSnap = await adminDb.collection('audit_runs')
    .where('clientId', '==', 'EhtaK8vdEBVoaXk8BO4p')
    .get();

  const docs = auditRunsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      data,
      createdAt: data.createdAt.toDate()
    };
  }).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  console.log(`Found ${docs.length} runs for EhtaK8vdEBVoaXk8BO4p:`);
  for (const doc of docs) {
    const purchaseResult = doc.data.results.find((r: any) => r.issueId === 'purchase-exists');
    const leadResult = doc.data.results.find((r: any) => r.issueId === 'lead-exists');
    console.log(`- Run: ${doc.id} at ${doc.createdAt.toISOString()}`);
    console.log(`  Score: ${doc.data.score}`);
    console.log(`  Purchase Exists: passed=${purchaseResult?.passed}, desc="${purchaseResult?.description}"`);
    console.log(`  Lead Exists: passed=${leadResult?.passed}, desc="${leadResult?.description}"`);
  }
}

run().catch(console.error);
