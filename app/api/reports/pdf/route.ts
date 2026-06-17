import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { adminDb } from '@/lib/firebase-admin';
import { generateContentWithRetry } from '@/lib/gemini';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json({ error: 'Missing clientId parameter' }, { status: 400 });
  }

  try {
    // 1. Fetch Client Details
    const clientDoc = await adminDb.collection('clients').doc(clientId).get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data()!;

    // 2. Fetch Latest Audit Run
    const latestAuditSnapshot = await adminDb.collection('audit_runs')
      .where('clientId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (latestAuditSnapshot.empty) {
      return NextResponse.json({ error: 'No audits found for this client.' }, { status: 400 });
    }

    const latestAuditDoc = latestAuditSnapshot.docs[0];
    const currentAudit = latestAuditDoc.data()!;
    const currentAuditId = latestAuditDoc.id;

    // 3. Fetch Historical Runs
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
      .filter(doc => doc.id !== currentAuditId);

    // 4. Fallback on-the-fly Gemini AI Explanation Generation
    let explanation = currentAudit.explanation;
    if (!explanation) {
      try {
        const clientName = clientData.name || 'Client';
        const clientIndustry = clientData.industry || 'Unknown';
        
        // Extract simplified issues for Gemini context
        const failedIssues = (currentAudit.issues || []).map((issue: any) => ({
          title: issue.title,
          category: issue.category,
          severity: issue.severity,
          description: issue.description,
          recommendation: issue.recommendation
        }));

        const prompt = `
        You are an expert Google Analytics 4 (GA4) and Google Tag Manager (GTM) auditor.
        Analyze the following audit results, client profile, and history, then generate a comprehensive, professional explanation.
        Tailor your descriptions, business impacts, and action plan suggestions specifically to the client's industry and business type.

        Client Profile:
        - Name: ${clientName}
        - Industry/Business Vertical: ${clientIndustry}

        Audit Run Details:
        - Health Score: ${currentAudit.score}/100
        - Grade: ${currentAudit.grade}
        
        Failed Checks (Issues):
        ${JSON.stringify(failedIssues, null, 2)}

        Historical Audit Run Scores (for trend analysis):
        ${JSON.stringify(auditHistory || [], null, 2)}

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

        const text = await generateContentWithRetry(prompt, {
          responseMimeType: 'application/json',
        });
        
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
        }
        
        explanation = JSON.parse(cleanedText);
        
        // Cache it in the Firestore document
        await latestAuditDoc.ref.update({ explanation });
      } catch (geminiError) {
        console.error('Error generating Gemini explanation on-the-fly:', geminiError);
        // Fallback default structure
        explanation = {
          executiveSummary: `This tracking health audit evaluates the analytics setup for ${clientData.name || 'the client'}. The overall tracking health score is ${currentAudit.score}/100, resulting in a grade of ${currentAudit.grade}.`,
          keyFindings: (currentAudit.issues || []).slice(0, 3).map((issue: any) => ({
            title: issue.title,
            explanation: issue.description,
            impact: `Directly impacts tracking capabilities. Recommended resolution: ${issue.recommendation}`
          })),
          actionPlan: (currentAudit.issues || []).map((issue: any, index: number) => ({
            step: index + 1,
            task: issue.recommendation,
            priority: issue.severity || 'medium',
            resource: 'Analytics Specialist'
          }))
        };
      }
    }

    // 5. Generate PDF Document
    const regularFontPath = path.join(process.cwd(), 'public/fonts/Roboto-Regular.ttf');
    const boldFontPath = path.join(process.cwd(), 'public/fonts/Roboto-Bold.ttf');

    const doc = new PDFDocument({ 
      margin: 50,
      size: 'A4',
      font: regularFontPath,
      bufferPages: true
    });

    // Register font variants
    doc.registerFont('Roboto-Regular', regularFontPath);
    doc.registerFont('Roboto-Bold', boldFontPath);
    doc.font('Roboto-Regular');

    const buffers: any[] = [];
    doc.on('data', buffers.push.bind(buffers));

    const pdfBufferPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
    });

    // Helper for checking space and triggering page breaks safely
    const checkSpace = (requiredSpace: number) => {
      // Height of A4 is 842. Margin bottom is 50. Safe print zone ends at 792.
      // Leaving buffer, let's say 760.
      if (doc.y + requiredSpace > 750) {
        doc.addPage();
      }
    };

    // ── PAGE 1: COVER HEADER BANNER ──────────────────────────────────────────
    const bannerY = doc.y;
    doc.rect(50, bannerY, 495, 80).fill('#0f172a'); // Navy background
    
    doc.font('Roboto-Bold').fontSize(16).fillColor('#ffffff').text('TRACKING HEALTH AUDIT REPORT', 65, bannerY + 22);
    doc.font('Roboto-Regular').fontSize(8.5).fillColor('#94a3b8').text('Gemini AI-Powered GA4 & GTM Performance Insight', 65, bannerY + 44);
    
    doc.y = bannerY + 95;
    
    // Client Metadata Card
    const metaY = doc.y;
    doc.roundedRect(50, metaY, 495, 55, 6).fill('#f8fafc');
    doc.roundedRect(50, metaY, 495, 55, 6).lineWidth(0.5).stroke('#e2e8f0');
    doc.lineWidth(3).moveTo(50, metaY).lineTo(50, metaY + 55).stroke('#4f46e5'); // indigo accent
    
    doc.font('Roboto-Bold').fontSize(8).fillColor('#64748b').text('CLIENT PROFILE', 65, metaY + 12);
    doc.font('Roboto-Regular').fontSize(9).fillColor('#0f172a').text(clientData.name, 65, metaY + 26);
    
    doc.font('Roboto-Bold').fontSize(8).fillColor('#64748b').text('INDUSTRY', 250, metaY + 12);
    doc.font('Roboto-Regular').fontSize(9).fillColor('#0f172a').text(clientData.industry || 'General', 250, metaY + 26);
    
    doc.font('Roboto-Bold').fontSize(8).fillColor('#64748b').text('DATE GENERATED', 400, metaY + 12);
    doc.font('Roboto-Regular').fontSize(9).fillColor('#0f172a').text(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), 400, metaY + 26);
    
    doc.y = metaY + 75;

    // ── OVERALL SCORE CARD & CATEGORY BARS ────────────────────────────────────
    const scoreBlockY = doc.y;
    const scoreColor = 
      currentAudit.score >= 90 ? '#059669' : 
      currentAudit.score >= 80 ? '#10b981' : 
      currentAudit.score >= 70 ? '#d97706' : '#dc2626';

    // Left Score Box
    doc.roundedRect(50, scoreBlockY, 130, 105, 6).fill('#f8fafc');
    doc.roundedRect(50, scoreBlockY, 130, 105, 6).lineWidth(0.5).stroke('#cbd5e1');
    doc.lineWidth(4).moveTo(52, scoreBlockY + 2).lineTo(52, scoreBlockY + 103).stroke('#4f46e5');

    doc.font('Roboto-Bold').fontSize(9).fillColor('#1e3a8a').text('OVERALL HEALTH', 50, scoreBlockY + 15, { width: 130, align: 'center' });
    doc.fontSize(38).fillColor(scoreColor).text(`${currentAudit.score}`, 50, scoreBlockY + 30, { width: 130, align: 'center' });
    doc.fontSize(12).fillColor('#4b5563').text(`Grade: ${currentAudit.grade}`, 50, scoreBlockY + 76, { width: 130, align: 'center' });

    // Right Category Bars
    let barY = scoreBlockY + 5;
    const categories = [
      { name: 'GA4 Setup', key: 'ga4Setup', max: 25 },
      { name: 'GTM Setup', key: 'gtmSetup', max: 25 },
      { name: 'Conversion Tracking', key: 'conversionTracking', max: 25 },
      { name: 'Event Quality', key: 'eventQuality', max: 15 },
      { name: 'Privacy & Consent', key: 'privacyConsent', max: 10 },
    ];

    categories.forEach((cat) => {
      const scoreVal = currentAudit.categoryScores?.[cat.key]?.score ?? 0;
      const maxVal = currentAudit.categoryScores?.[cat.key]?.max ?? cat.max;
      const percent = Math.min(100, Math.max(0, (scoreVal / maxVal) * 100));

      doc.font('Roboto-Bold').fontSize(8.5).fillColor('#0f172a').text(cat.name, 200, barY);
      doc.font('Roboto-Regular').fontSize(8.5).fillColor('#64748b').text(`${scoreVal}/${maxVal}`, 420, barY, { align: 'right', width: 125 });

      doc.roundedRect(200, barY + 11, 345, 5, 2.5).fill('#e2e8f0');
      if (percent > 0) {
        const barColor = percent >= 80 ? '#059669' : percent >= 60 ? '#d97706' : '#dc2626';
        doc.roundedRect(200, barY + 11, (percent / 100) * 345, 5, 2.5).fill(barColor);
      }

      barY += 20;
    });

    doc.y = scoreBlockY + 125;

    // ── SCORE HISTORY TREND ───────────────────────────────────────────────────
    doc.font('Roboto-Bold').fontSize(12).fillColor('#1e3a8a').text('Score History Trend');
    doc.moveDown(0.4);

    if (auditHistory.length === 0) {
      doc.font('Roboto-Regular').fontSize(9.5).fillColor('#64748b').text('This is the first audit run. No historical trend available.');
      doc.y += 15;
    } else {
      let tagX = 50;
      let trendY = doc.y;
      
      auditHistory.forEach((run: any) => {
        const dateStr = run.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const labelFull = `${dateStr}: Score ${run.score} (${run.grade})`;
        doc.font('Roboto-Regular').fontSize(8.5);
        const textWidth = doc.widthOfString(labelFull) + 20;

        if (tagX + textWidth > 545) {
          tagX = 50;
          trendY += 26;
        }

        doc.roundedRect(tagX, trendY, textWidth, 20, 4).fill('#f8fafc');
        doc.roundedRect(tagX, trendY, textWidth, 20, 4).lineWidth(0.5).stroke('#e2e8f0');

        const dotColor = 
          run.score >= 90 ? '#059669' : 
          run.score >= 80 ? '#10b981' : 
          run.score >= 70 ? '#d97706' : '#dc2626';
        
        doc.circle(tagX + 8, trendY + 10, 3).fill(dotColor);
        doc.font('Roboto-Regular').fontSize(8.5).fillColor('#4b5563').text(labelFull, tagX + 16, trendY + 6);

        tagX += textWidth + 10;
      });

      doc.y = trendY + 30;
    }
    doc.moveDown(0.8);

    // ── GEMINI AI EXECUTIVE SUMMARY ──────────────────────────────────────────
    checkSpace(120);
    doc.font('Roboto-Bold').fontSize(12).fillColor('#1e3a8a').text('Gemini AI Executive Summary');
    doc.moveDown(0.4);

    const summaryText = explanation.executiveSummary || 'No summary generated.';
    const textHeight = doc.heightOfString(summaryText, { width: 465, lineGap: 3 });
    const padding = 12;
    const boxHeight = textHeight + (padding * 2);

    const boxY = doc.y;
    doc.roundedRect(50, boxY, 495, boxHeight, 6).fill('#f8fafc');
    doc.roundedRect(50, boxY, 495, boxHeight, 6).lineWidth(0.5).stroke('#cbd5e1');
    doc.lineWidth(4).moveTo(52, boxY + 2).lineTo(52, boxY + boxHeight - 2).stroke('#4f46e5');

    doc.font('Roboto-Regular').fontSize(9.5).fillColor('#1e293b')
       .text(summaryText, 65, boxY + padding, { width: 465, lineGap: 3 });

    doc.y = boxY + boxHeight + 20;

    // ── GEMINI AI KEY FINDINGS ────────────────────────────────────────────────
    checkSpace(150);
    doc.font('Roboto-Bold').fontSize(12).fillColor('#1e3a8a').text('Key Findings & Analysis');
    doc.moveDown(0.6);

    const findings = explanation.keyFindings || [];
    if (findings.length === 0) {
      doc.font('Roboto-Regular').fontSize(9.5).fillColor('#64748b').text('No significant tracking anomalies or issues detected.');
      doc.moveDown(1.5);
    } else {
      findings.forEach((finding: any, i: number) => {
        checkSpace(120);
        const cardY = doc.y;
        
        // Finding Title
        doc.font('Roboto-Bold').fontSize(10.5).fillColor('#0f172a').text(`${i + 1}. ${finding.title}`);
        doc.moveDown(0.3);

        // Explanation text
        doc.font('Roboto-Regular').fontSize(9.5).fillColor('#334155').text(finding.explanation, { width: 495, lineGap: 2.5 });
        doc.moveDown(0.4);

        // Business Impact Sub-card
        const impactText = `Business Impact: ${finding.impact}`;
        const impHeight = doc.heightOfString(impactText, { width: 470, lineGap: 2 });
        const impBoxHeight = impHeight + 12;
        const impY = doc.y;

        doc.roundedRect(55, impY, 490, impBoxHeight, 4).fill('#fef2f2'); // soft red
        doc.roundedRect(55, impY, 490, impBoxHeight, 4).lineWidth(0.5).stroke('#fee2e2');
        doc.lineWidth(3).moveTo(57, impY + 1).lineTo(57, impY + impBoxHeight - 1).stroke('#f87171');

        doc.font('Roboto-Regular').fontSize(8.5).fillColor('#991b1b')
           .text(impactText, 68, impY + 6, { width: 465, lineGap: 2 });

        doc.y = impY + impBoxHeight + 16;
      });
    }

    // ── GEMINI AI ACTION PLAN ────────────────────────────────────────────────
    checkSpace(150);
    doc.font('Roboto-Bold').fontSize(12).fillColor('#1e3a8a').text('Recommended Action Plan');
    doc.moveDown(0.6);

    const actions = explanation.actionPlan || [];
    if (actions.length === 0) {
      doc.font('Roboto-Regular').fontSize(9.5).fillColor('#64748b').text('All systems clean. No action items required.');
      doc.moveDown(1.5);
    } else {
      const colPriorityW = 75;
      const colTaskW = 310;
      const colResourceW = 110;

      const headerY = doc.y;
      doc.rect(50, headerY, 495, 20).fill('#0f172a');
      doc.font('Roboto-Bold').fontSize(8.5).fillColor('#ffffff');
      doc.text('PRIORITY', 58, headerY + 6, { width: colPriorityW });
      doc.text('RECOMMENDED TASK', 50 + colPriorityW + 10, headerY + 6, { width: colTaskW });
      doc.text('RESOURCE', 50 + colPriorityW + colTaskW + 10, headerY + 6, { width: colResourceW });

      let rowY = headerY + 20;

      actions.forEach((act: any, i: number) => {
        const taskText = act.task || '';
        const textHeight = doc.heightOfString(taskText, { width: colTaskW - 20, lineGap: 2 });
        const rowHeight = Math.max(30, textHeight + 12);

        // Page break check inside table
        if (rowY + rowHeight > 750) {
          doc.addPage();
          
          const newHeaderY = doc.y;
          doc.rect(50, newHeaderY, 495, 20).fill('#0f172a');
          doc.font('Roboto-Bold').fontSize(8.5).fillColor('#ffffff');
          doc.text('PRIORITY', 58, newHeaderY + 6, { width: colPriorityW });
          doc.text('RECOMMENDED TASK', 50 + colPriorityW + 10, newHeaderY + 6, { width: colTaskW });
          doc.text('RESOURCE', 50 + colPriorityW + colTaskW + 10, newHeaderY + 6, { width: colResourceW });
          rowY = newHeaderY + 20;
        }

        // Zebra striped bg
        if (i % 2 === 1) {
          doc.rect(50, rowY, 495, rowHeight).fill('#f8fafc');
        }

        // Bottom border
        doc.lineWidth(0.5).moveTo(50, rowY + rowHeight).lineTo(545, rowY + rowHeight).stroke('#e2e8f0');

        // Priority Badge Color
        const priority = (act.priority || 'medium').toLowerCase();
        const pColor = 
          priority === 'critical' ? '#dc2626' : 
          priority === 'high' ? '#f97316' : 
          priority === 'medium' ? '#d97706' : '#475569';

        doc.font('Roboto-Bold').fontSize(8).fillColor(pColor).text(priority.toUpperCase(), 58, rowY + 10);
        
        // Recommended Task Description
        doc.font('Roboto-Regular').fontSize(8.5).fillColor('#1e293b')
           .text(taskText, 50 + colPriorityW + 10, rowY + 8, { width: colTaskW - 10, lineGap: 2 });

        // Resource assigned
        doc.font('Roboto-Regular').fontSize(8).fillColor('#4b5563')
           .text(act.resource || 'Specialist', 50 + colPriorityW + colTaskW + 10, rowY + 10, { width: colResourceW - 10 });

        rowY += rowHeight;
      });

      doc.y = rowY + 20;
    }

    // ── APPENDIX: DETAILED TECHNICAL CHECKLIST ────────────────────────────────
    checkSpace(150);
    doc.font('Roboto-Bold').fontSize(12).fillColor('#1e3a8a').text('Appendix: Technical Audit Checklist');
    doc.moveDown(0.4);
    doc.font('Roboto-Regular').fontSize(9).fillColor('#4b5563').text('This appendix shows the detailed status of the deterministic audit checks run against the GA4 property and GTM container.', { width: 495 });
    doc.moveDown(0.8);

    // Fallback if results not stored
    const results = currentAudit.results || (currentAudit.issues || []).map((issue: any) => ({
      ...issue,
      passed: false
    }));

    // Sort results by category, then by passed status (failed first)
    const sortedResults = [...results].sort((a: any, b: any) => {
      const catA = a.category || '';
      const catB = b.category || '';
      if (catA !== catB) return catA.localeCompare(catB);
      return (a.passed === b.passed) ? 0 : a.passed ? 1 : -1;
    });

    const colRuleCatW = 120;
    const colRuleTitleW = 280;
    const colRuleStatusW = 75;

    const appHeaderY = doc.y;
    doc.rect(50, appHeaderY, 495, 20).fill('#1e293b'); // Dark Grey header
    doc.font('Roboto-Bold').fontSize(8).fillColor('#ffffff');
    doc.text('CATEGORY', 58, appHeaderY + 6, { width: colRuleCatW });
    doc.text('AUDITED CHECK', 50 + colRuleCatW + 10, appHeaderY + 6, { width: colRuleTitleW });
    doc.text('STATUS', 50 + colRuleCatW + colRuleTitleW + 10, appHeaderY + 6, { width: colRuleStatusW });

    let appRowY = appHeaderY + 20;

    sortedResults.forEach((rule: any, i: number) => {
      const ruleHeight = 24;

      if (appRowY + ruleHeight > 750) {
        doc.addPage();
        
        const newHeaderY = doc.y;
        doc.rect(50, newHeaderY, 495, 20).fill('#1e293b');
        doc.font('Roboto-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('CATEGORY', 58, newHeaderY + 6, { width: colRuleCatW });
        doc.text('AUDITED CHECK', 50 + colRuleCatW + 10, newHeaderY + 6, { width: colRuleTitleW });
        doc.text('STATUS', 50 + colRuleCatW + colRuleTitleW + 10, newHeaderY + 6, { width: colRuleStatusW });
        appRowY = newHeaderY + 20;
      }

      // Zebra striped
      if (i % 2 === 1) {
        doc.rect(50, appRowY, 495, ruleHeight).fill('#f8fafc');
      }

      // Bottom border line
      doc.lineWidth(0.5).moveTo(50, appRowY + ruleHeight).lineTo(545, appRowY + ruleHeight).stroke('#e2e8f0');

      // Category
      doc.font('Roboto-Regular').fontSize(7.5).fillColor('#4b5563')
         .text(rule.category || 'Setup', 58, appRowY + 8, { width: colRuleCatW - 10, ellipsis: true });

      // Title/Name
      doc.font('Roboto-Bold').fontSize(8).fillColor('#1e293b')
         .text(rule.title || rule.name || 'Unnamed rule check', 50 + colRuleCatW + 10, appRowY + 8, { width: colRuleTitleW - 10, ellipsis: true });

      // Status
      const statusColor = rule.passed ? '#059669' : '#dc2626';
      const statusText = rule.passed ? 'PASSED' : 'FAILED';
      doc.font('Roboto-Bold').fontSize(8).fillColor(statusColor)
         .text(statusText, 50 + colRuleCatW + colRuleTitleW + 10, appRowY + 8, { width: colRuleStatusW - 10 });

      appRowY += ruleHeight;
    });

    doc.y = appRowY + 10;

    // ── FOOTERS ON EVERY PAGE ────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      
      // Bottom line separator
      doc.lineWidth(0.5).moveTo(50, 795).lineTo(545, 795).stroke('#cbd5e1');
      
      doc.font('Roboto-Regular').fontSize(7.5).fillColor('#94a3b8')
         .text(`Tracking Health AI  ·  ${clientData.name}  ·  Audit Report  ·  Confidential`, 50, 805, { width: 350, align: 'left' });
         
      doc.font('Roboto-Regular').fontSize(7.5).fillColor('#94a3b8')
         .text(`Page ${i + 1} of ${range.count}`, 450, 805, { width: 95, align: 'right' });
    }

    doc.end();

    const pdfBuffer = await pdfBufferPromise;

    return new Response(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${clientData.name.replace(/\s+/g, '_')}_tracking_audit.pdf"`
      }
    });

  } catch (error) {
    console.error('Error generating PDF report:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
