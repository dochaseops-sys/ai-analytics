import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { adminDb } from '@/lib/firebase-admin';
import path from 'path';

const fl = (v: string) =>
  v?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'N/A';

const grade = (s: number) =>
  s >= 90 ? 'A+' : s >= 80 ? 'A' : s >= 70 ? 'B' : s >= 60 ? 'C' : 'D';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });

  try {
    // ── Fetch data ──────────────────────────────────────────────────────────
    const [clientDoc, profileSnap, auditSnap] = await Promise.all([
      adminDb.collection('clients').doc(clientId).get(),
      adminDb.collection('client_profiles').where('clientId', '==', clientId).orderBy('createdAt', 'desc').limit(1).get(),
      adminDb.collection('personalised_audit_runs').where('clientId', '==', clientId).orderBy('createdAt', 'desc').limit(1).get(),
    ]);

    if (!clientDoc.exists) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    if (auditSnap.empty) return NextResponse.json({ error: 'No personalised audit found. Run one first.' }, { status: 400 });

    const client = clientDoc.data()!;
    const profile = profileSnap.empty ? null : profileSnap.docs[0].data();
    const audit = auditSnap.docs[0].data();

    // ── PDF setup ───────────────────────────────────────────────────────────
    const regularFont = path.join(process.cwd(), 'public/fonts/Roboto-Regular.ttf');
    const boldFont    = path.join(process.cwd(), 'public/fonts/Roboto-Bold.ttf');

    const doc = new PDFDocument({ margin: 50, font: regularFont, size: 'A4' });
    doc.registerFont('R', regularFont);
    doc.registerFont('B', boldFont);

    const buffers: Buffer[] = [];
    doc.on('data', (b: Buffer) => buffers.push(b));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(buffers))));

    // ── Palette ─────────────────────────────────────────────────────────────
    const navy    = '#0f172a';
    const emerald = '#059669';
    const indigo  = '#4f46e5';
    const slate   = '#475569';
    const light   = '#f8fafc';
    const red     = '#ef4444';
    const amber   = '#f59e0b';
    const text    = '#1e293b';

    const W = 495; // usable width (595 − 2×50)

    const safeMoveDown = (lines = 1) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(lines);
    };

    const section = (title: string) => {
      safeMoveDown(1.5);
      if (doc.y > 700) doc.addPage();
      doc.rect(50, doc.y, W, 22).fill(navy);
      doc.font('B').fontSize(10).fillColor('#ffffff').text(title, 58, doc.y - 16);
      doc.fillColor(text);
      safeMoveDown(1);
    };

    const kv = (label: string, value: string, indent = 58) => {
      if (doc.y > 720) doc.addPage();
      doc.font('B').fontSize(9).fillColor(slate).text(`${label}:`, indent, doc.y, { continued: true });
      doc.font('R').fillColor(text).text(` ${value}`);
    };

    const pill = (label: string, color: string) => {
      // simple inline "badge" as colored text bullet
      doc.font('R').fontSize(8).fillColor(color).text(`● ${label}   `, { continued: true });
    };

    // ── Cover header ────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 80).fill(navy);
    doc.font('B').fontSize(22).fillColor('#ffffff').text('Personalised Audit Report', 65, 65);
    doc.font('R').fontSize(10).fillColor('#94a3b8').text('Adaptive GA4 & GTM Tracking Analysis', 65, 92);
    doc.font('R').fontSize(9).fillColor('#64748b')
       .text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 65, 108);
    doc.y = 145;

    // ── Client info ─────────────────────────────────────────────────────────
    kv('Client', client.name || clientId);
    kv('Industry', fl(client.industry || profile?.industry || ''));
    kv('Business Model', fl(profile?.businessModel || ''));
    kv('Funnel Type', fl(profile?.funnelType || ''));
    kv('Classification Confidence', profile?.confidence ? `${Math.round(profile.confidence * 100)}%` : 'N/A');

    // ── Score overview ───────────────────────────────────────────────────────
    section('HEALTH SCORE OVERVIEW');

    const scoreColor = audit.score >= 80 ? emerald : audit.score >= 60 ? amber : red;
    doc.font('B').fontSize(48).fillColor(scoreColor).text(`${audit.score}`, 50, doc.y, { width: 90, align: 'center' });
    const afterScore = doc.y;
    doc.font('B').fontSize(14).fillColor(scoreColor).text(`Grade ${grade(audit.score)}`, 50, afterScore - 20, { width: 90, align: 'center' });

    // Category bars (right of score)
    const cats = Object.entries(audit.categoryScores || {});
    let barY = afterScore - 65;
    cats.forEach(([cat, val]) => {
      const pct = Math.round(Number(val));
      doc.font('R').fontSize(8).fillColor(slate).text(fl(cat), 160, barY, { width: 200 });
      doc.rect(160, barY + 10, 200, 6).fill('#e2e8f0');
      doc.rect(160, barY + 10, (pct / 100) * 200, 6).fill(pct >= 80 ? emerald : pct >= 60 ? amber : red);
      doc.font('B').fontSize(8).fillColor(text).text(`${pct}`, 368, barY + 8);
      barY += 22;
    });

    doc.y = barY + 10;

    if (audit.scoreExplanation) {
      safeMoveDown(0.5);
      doc.font('R').fontSize(9).fillColor(slate)
         .text(audit.scoreExplanation, 58, doc.y, { width: W - 16, lineGap: 2 });
    }

    // ── Client Profile ───────────────────────────────────────────────────────
    if (profile) {
      section('CLIENT PROFILE');

      if (profile.reasoningSummary) {
        doc.font('R').fontSize(9).fillColor(text).text(profile.reasoningSummary, 58, doc.y, { width: W - 16, lineGap: 2 });
        safeMoveDown(0.8);
      }

      if (profile.primaryConversionGoals?.length) {
        doc.font('B').fontSize(9).fillColor(slate).text('Primary Goals:', 58);
        doc.font('R').fontSize(9).fillColor(text);
        profile.primaryConversionGoals.forEach((g: string) => pill(fl(g), emerald));
        doc.text(''); // end continued
        safeMoveDown(0.5);
      }

      if (profile.secondaryConversionGoals?.length) {
        doc.font('B').fontSize(9).fillColor(slate).text('Secondary Goals:', 58);
        doc.font('R').fontSize(9).fillColor(text);
        profile.secondaryConversionGoals.forEach((g: string) => pill(fl(g), slate));
        doc.text('');
        safeMoveDown(0.5);
      }
    }

    // ── Recommendations ──────────────────────────────────────────────────────
    const recs = audit.recommendations || [];
    section(`RECOMMENDATIONS  (${recs.length} total)`);

    if (recs.length === 0) {
      doc.font('R').fontSize(10).fillColor(emerald).text('✓ No gaps detected — tracking looks healthy!', 58);
    } else {
      recs.forEach((rec: any, i: number) => {
        if (doc.y > 680) doc.addPage();

        const sevColor = rec.severity === 'critical' ? red : rec.severity === 'high' ? '#f97316' : rec.severity === 'medium' ? amber : slate;

        doc.font('B').fontSize(10).fillColor(text).text(`${i + 1}.  ${rec.title}`, 58, doc.y);
        safeMoveDown(0.2);
        doc.font('B').fontSize(8).fillColor(sevColor).text(rec.severity.toUpperCase(), 72, doc.y, { continued: true });
        if (rec.canAutoImplement) doc.fillColor(emerald).text('   AUTO-IMPLEMENTABLE');
        else doc.fillColor(slate).text('   MANUAL REVIEW');
        safeMoveDown(0.3);
        doc.font('R').fontSize(9).fillColor(text).text(rec.whyItMatters, 72, doc.y, { width: W - 30, lineGap: 2 });
        safeMoveDown(0.3);
        doc.font('B').fontSize(8).fillColor(slate).text('Fix: ', 72, doc.y, { continued: true });
        doc.font('R').fillColor(text).text(rec.recommendedFix, { width: W - 30 });
        if (rec.businessImpact) {
          doc.font('B').fontSize(8).fillColor(indigo).text('Impact: ', 72, doc.y, { continued: true });
          doc.font('R').fillColor(slate).text(rec.businessImpact, { width: W - 30 });
        }
        safeMoveDown(0.8);
      });
    }

    // ── Measurement Coverage ─────────────────────────────────────────────────
    const events = profile?.expectedEvents || [];
    if (events.length > 0) {
      section(`MEASUREMENT COVERAGE  (${events.length} expected events)`);

      const gaps = audit.gaps || [];
      events.forEach((ev: any) => {
        if (doc.y > 720) doc.addPage();
        const missing = gaps.some((g: any) => g.ruleId === 'expected-critical-event-missing' && g.evidence?.expectedEvent === ev.eventName);
        const notKey  = gaps.some((g: any) => g.ruleId === 'expected-event-not-key-event'    && g.evidence?.eventName    === ev.eventName);
        const statusLabel = missing ? 'MISSING' : notKey ? 'NOT KEY EVENT' : 'OK';
        const statusColor = missing ? red : notKey ? amber : emerald;

        doc.font('B').fontSize(9).fillColor(text).text(`• ${ev.eventName}`, 58, doc.y, { continued: true });
        doc.font('B').fontSize(8).fillColor(statusColor).text(`   ${statusLabel}`);
        if (ev.reason) {
          doc.font('R').fontSize(8).fillColor(slate).text(ev.reason, 70, doc.y, { width: W - 30, lineGap: 1 });
        }
        safeMoveDown(0.3);
      });
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    const pages = (doc as any)._pageBuffer?.length || 1;
    for (let i = 0; i < pages; i++) {
      doc.switchToPage?.(i);
      doc.font('R').fontSize(7).fillColor('#94a3b8')
         .text(`Tracking Health AI  ·  ${client.name}  ·  Personalised Audit Report  ·  Confidential`, 50, 820, { width: W, align: 'center' });
    }

    doc.end();
    const pdf = await done;

    return new Response(pdf as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(client.name || clientId).replace(/\s+/g, '_')}_personalised_audit.pdf"`,
      },
    });
  } catch (err) {
    console.error('[personalised-pdf]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
