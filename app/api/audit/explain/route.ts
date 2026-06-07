import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { generateContentWithRetry } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auditRunId } = body;

    if (!auditRunId) {
      return NextResponse.json({ error: 'Missing auditRunId parameter' }, { status: 400 });
    }

    // 1. Fetch current audit run
    const runRef = adminDb.collection('audit_runs').doc(auditRunId);
    const runDoc = await runRef.get();

    if (!runDoc.exists) {
      return NextResponse.json({ error: 'Audit run not found' }, { status: 404 });
    }

    const runData = runDoc.data()!;

    // If explanation is already cached, return it directly
    if (runData.explanation) {
      return NextResponse.json({ explanation: runData.explanation });
    }

    const { clientId, score, grade, issues, results } = runData;

    // Fetch client document for industry/business type context
    const clientDoc = await adminDb.collection('clients').doc(clientId).get();
    const clientData = clientDoc.exists ? clientDoc.data() : null;
    const clientName = clientData?.name || 'Client';
    const clientIndustry = clientData?.industry || 'Unknown';

    // 2. Fetch history (limit to last 5 runs before this one)
    const historySnapshot = await adminDb.collection('audit_runs')
      .where('clientId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    const auditHistory = historySnapshot.docs
      .map(doc => ({
        id: doc.id,
        score: doc.data().score,
        grade: doc.data().grade,
        createdAt: doc.data().createdAt.toDate()
      }))
      .filter(doc => doc.id !== auditRunId); // exclude current

    const prompt = `
    You are an expert Google Analytics 4 (GA4) and Google Tag Manager (GTM) auditor.
    Analyze the following audit results, client profile, and history, then generate a comprehensive, professional explanation.
    Tailor your descriptions, business impacts, and action plan suggestions specifically to the client's industry and business type.

    Client Profile:
    - Name: ${clientName}
    - Industry/Business Vertical: ${clientIndustry}

    Audit Run Details:
    - Health Score: ${score}/100
    - Grade: ${grade}
    
    Failed Checks (Issues):
    ${JSON.stringify(issues, null, 2)}

    Historical Audit Run Scores (for trend analysis):
    ${JSON.stringify(auditHistory, null, 2)}

    Please output a JSON object matching this schema:
    {
      "executiveSummary": "A high-level explanation of the client's current tracking health. Explain what the score and grade mean in simple terms, and mention if the health has improved, declined, or stayed stable based on the audit history.",
      "keyFindings": [
        {
          "title": "Short title of the finding",
          "explanation": "Why this is an issue and how it affects business tracking in plain English.",
          "impact": "What is the consequence of not fixing this (e.g. lost conversion data, compliance issues)"
        }
      ],
      "actionPlan": [
        {
          "step": 1,
          "task": "Specific actionable recommendation",
          "priority": "critical | high | medium | low",
          "resource": "Developer | Analytics Specialist"
        }
      ]
    }

    Make sure all explanations are professional, clear, agency-ready, and easy for non-technical stakeholders to understand.
    `;

    // 3. Generate explanation using Gemini with retry/fallback
    const text = await generateContentWithRetry(prompt, {
      responseMimeType: 'application/json',
    });
    const explanation = JSON.parse(text);

    // 4. Cache the explanation back to Firestore
    await runRef.update({ explanation });

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('Error generating Gemini explanation:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
