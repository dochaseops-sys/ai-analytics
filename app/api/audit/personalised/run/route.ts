import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { buildClientProfile, getClientProfile, getLatestWebsiteSnapshot } from '@/lib/client-intelligence/client-profile-builder';
import { runPersonalisedAudit } from '@/lib/personalised-audit/personalised-audit-engine';
import { fetchAuditEvidence } from '@/lib/personalised-audit/google-data';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientId = body.clientId as string | undefined;
    if (!clientId) return NextResponse.json({ error: 'Missing clientId.' }, { status: 400 });

    const { leadTypes, leadEventNames, purchaseEventName, pageViewEventName } = body;
    if (leadTypes !== undefined || leadEventNames !== undefined || purchaseEventName !== undefined || pageViewEventName !== undefined) {
      const updateData: Record<string, any> = {};
      if (leadTypes !== undefined) updateData.leadTypes = leadTypes;
      if (leadEventNames !== undefined) updateData.leadEventNames = leadEventNames;
      if (purchaseEventName !== undefined) updateData.purchaseEventName = purchaseEventName;
      if (pageViewEventName !== undefined) updateData.pageViewEventName = pageViewEventName;
      await adminDb.collection('clients').doc(clientId).update(updateData);
    }

    const evidence = await fetchAuditEvidence(clientId);
    let profile = body.refreshProfile ? undefined : await getClientProfile(clientId);
    let snapshot = await getLatestWebsiteSnapshot(clientId);

    if (!profile) {
      const built = await buildClientProfile({
        clientId,
        websiteUrl: body.websiteUrl || evidence.websiteUrl,
        refreshCrawl: true,
        maxPages: body.maxPages || 25,
        maxDepth: body.maxDepth || 2
      });
      profile = built.profile;
      snapshot = built.snapshot;
    }

    const summary = await runPersonalisedAudit({
      clientProfile: profile,
      websiteSnapshot: snapshot,
      ga4Data: evidence.ga4Data,
      gtmData: evidence.gtmData,
      trafficSources: evidence.trafficSources,
      pageTraffic: evidence.pageTraffic
    });

    const ref = adminDb.collection('personalised_audit_runs').doc();
    const auditRun = {
      id: ref.id,
      ...summary,
      createdAt: new Date()
    };
    await ref.set(auditRun);

    await Promise.all(auditRun.recommendations.map((recommendation) => (
      adminDb.collection('personalised_recommendations').doc(recommendation.id).set({
        ...recommendation,
        auditRunId: ref.id,
        createdAt: new Date()
      })
    )));

    return NextResponse.json({ success: true, auditRun, profile });
  } catch (error) {
    console.error('Error running personalised audit:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
