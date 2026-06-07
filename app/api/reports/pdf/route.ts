import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { adminDb } from '@/lib/firebase-admin';
import path from 'path';
import fs from 'fs';

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

    const currentAudit = latestAuditSnapshot.docs[0].data()!;

    // 3. Fetch Historical Runs
    const historySnapshot = await adminDb.collection('audit_runs')
      .where('clientId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    const auditHistory = historySnapshot.docs
      .map(doc => ({
        score: doc.data().score,
        grade: doc.data().grade,
        createdAt: doc.data().createdAt.toDate()
      }))
      .filter(doc => doc.createdAt.getTime() !== currentAudit.createdAt.toDate().getTime());

    // 4. Generate PDF
    const regularFontPath = path.join(process.cwd(), 'public/fonts/Roboto-Regular.ttf');
    const boldFontPath = path.join(process.cwd(), 'public/fonts/Roboto-Bold.ttf');

    const doc = new PDFDocument({ 
      margin: 50,
      font: regularFontPath
    });

    // Register bold and regular variants for explicit switching
    doc.registerFont('Roboto-Regular', regularFontPath);
    doc.registerFont('Roboto-Bold', boldFontPath);

    const buffers: any[] = [];
    doc.on('data', buffers.push.bind(buffers));

    const pdfBufferPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
    });

    // Font Colors
    const primaryColor = '#1e3a8a'; // Deep Navy
    const secondaryColor = '#4b5563'; // Slate gray
    const textColor = '#374151'; // Dark gray
    const lightBg = '#f3f4f6'; // Light gray box
    const redColor = '#ef4444';
    const orangeColor = '#f97316';
    const yellowColor = '#eab308';
    const greenColor = '#10b981';

    // Header
    doc.font('Roboto-Bold').fontSize(24).fillColor(primaryColor).text('Tracking Health AI', { align: 'left' });
    doc.font('Roboto-Regular').fontSize(10).fillColor(secondaryColor).text('WEEKLY GA4 & GTM AUDIT REPORT', { align: 'left' });
    
    doc.moveDown(1.5);
    
    // Metadata Block
    doc.fontSize(12).fillColor(textColor).text(`Client: ${clientData.name}`);
    doc.text(`Industry: ${clientData.industry}`);
    doc.text(`Date Generated: ${new Date().toLocaleDateString()}`);
    
    doc.moveDown(2);

    // Score Summary Box
    doc.rect(50, doc.y, 500, 110).fill(lightBg);
    
    // Render text on top of filled rectangle
    doc.font('Roboto-Bold').fillColor(primaryColor).fontSize(16).text('Tracking Health Overview', 70, doc.y + 15);
    
    // Large Score
    doc.fontSize(36).fillColor(primaryColor).text(`${currentAudit.score}`, 70, doc.y + 10);
    doc.font('Roboto-Regular').fontSize(12).fillColor(secondaryColor).text(`Grade: ${currentAudit.grade}`, 160, doc.y - 30);

    // Categories Table
    const catScores = currentAudit.categoryScores || {};
    let catY = doc.y - 10;
    doc.fontSize(9).fillColor(textColor);
    doc.text(`GA4 Setup: ${catScores.ga4Setup?.score || 0}/${catScores.ga4Setup?.max || 25}`, 300, catY);
    doc.text(`GTM Setup: ${catScores.gtmSetup?.score || 0}/${catScores.gtmSetup?.max || 25}`, 300, catY + 15);
    doc.text(`Conversion Tracking: ${catScores.conversionTracking?.score || 0}/${catScores.conversionTracking?.max || 25}`, 300, catY + 30);
    doc.text(`Event Quality: ${catScores.eventQuality?.score || 0}/${catScores.eventQuality?.max || 15}`, 300, catY + 45);
    doc.text(`Privacy & Consent: ${catScores.privacyConsent?.score || 0}/${catScores.privacyConsent?.max || 10}`, 300, catY + 60);

    doc.y = catY + 80;
    doc.moveDown(2);

    // Historical Trend Section
    doc.font('Roboto-Bold').fontSize(14).fillColor(primaryColor).text('Score History Trend');
    doc.moveDown(0.5);
    doc.font('Roboto-Regular');
    if (auditHistory.length === 0) {
      doc.fontSize(10).fillColor(textColor).text('This is the first audit run. No historical trend available.');
    } else {
      doc.fontSize(10).fillColor(textColor);
      auditHistory.forEach((run, i) => {
        doc.text(`${run.createdAt.toLocaleDateString()}: Score ${run.score}/100 (Grade: ${run.grade})`);
      });
    }

    doc.moveDown(2);

    // AI Executive Recommendations Section
    if (currentAudit.explanation) {
      const exp = currentAudit.explanation;
      doc.font('Roboto-Bold').fontSize(14).fillColor(primaryColor).text('Gemini AI Executive Summary');
      doc.moveDown(0.5);
      doc.font('Roboto-Regular').fontSize(10).fillColor(textColor).text(exp.executiveSummary || 'No summary generated.', { width: 500 });
      doc.moveDown(1.5);
    }

    // Issues & Recommendations Section
    doc.font('Roboto-Bold').fontSize(14).fillColor(primaryColor).text('Audit Issues & Action Plan');
    doc.moveDown(0.5);

    const issues = currentAudit.issues || [];
    if (issues.length === 0) {
      doc.font('Roboto-Regular').fontSize(10).fillColor(greenColor).text('✓ Excellent job! All audit rules passed. No tracking issues found.');
    } else {
      issues.forEach((issue: any, index: number) => {
        if (doc.y > 650) doc.addPage();
        
        const severityColor = 
          issue.severity === 'critical' ? redColor : 
          issue.severity === 'high' ? orangeColor : 
          issue.severity === 'medium' ? yellowColor : secondaryColor;

        doc.font('Roboto-Bold').fontSize(11).fillColor(primaryColor).text(`${index + 1}. ${issue.title}`);
        doc.font('Roboto-Regular').fontSize(9).fillColor(severityColor).text(`Severity: ${issue.severity.toUpperCase()}   |   Category: ${issue.category}`);
        doc.fontSize(10).fillColor(textColor).text(`Description: ${issue.description}`);
        doc.fontSize(10).fillColor(textColor).text(`Recommendation: ${issue.recommendation}`);
        doc.moveDown(1);
      });
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
